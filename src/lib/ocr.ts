import type { PdfTextItem } from "@/converters/pdf-layout";

/**
 * Reconhecimento de texto (OCR) no navegador com Tesseract.js.
 * Tudo é servido pelo próprio app (núcleo WebAssembly e modelos de idioma) e carregado
 * só quando necessário: nenhuma imagem sai do navegador e nada vem de CDN externa.
 */

export type OcrLanguage = "por" | "eng" | "por+eng";

export const OCR_LANGUAGE_CHOICES: { value: OcrLanguage; label: string }[] = [
  { value: "por", label: "Português" },
  { value: "eng", label: "Inglês" },
  { value: "por+eng", label: "Português + Inglês (mais lento)" },
];

/** Palavras com confiança abaixo disso costumam ser ruído (manchas, logotipos, fotos). */
const MIN_WORD_CONFIDENCE = 25;

export interface OcrPageResult {
  items: PdfTextItem[];
  /** Confiança média (0–100) das palavras aceitas. */
  confidence: number;
}

export interface OcrEngine {
  /**
   * Reconhece o texto de uma imagem. `scale` converte pixels para as unidades desejadas
   * (ex.: pontos de PDF), para misturar páginas com e sem OCR no mesmo documento.
   */
  recognize(image: HTMLCanvasElement, scale?: number): Promise<OcrPageResult>;
  terminate(): Promise<void>;
}

/**
 * Modelos de idioma (tessdata "best_int") servidos de /public/tesseract.
 * Para atualizar: `bun run ocr:langs` (copia de @tesseract.js-data).
 * Obs.: passar os dados direto ao createWorker ({ code, data }) não funciona no
 * Tesseract.js 7 (ele usa os dados como nome do idioma), por isso o langPath.
 */
const LANG_PATH = "/tesseract";
/** Tempo máximo para iniciar o motor (download + compilação do WebAssembly). */
const INIT_TIMEOUT_MS = 120_000;

export async function createOcrEngine(
  language: OcrLanguage,
  signal: AbortSignal,
  onProgress?: (fraction: number) => void,
): Promise<OcrEngine> {
  const [tesseract, worker, core] = await Promise.all([
    import("tesseract.js"),
    import("tesseract.js/dist/worker.min.js?url"),
    import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url"),
  ]);
  signal.throwIfAborted();

  // Erros dentro do worker do Tesseract nem sempre rejeitam a promessa da chamada
  // (a conversão ficaria parada). Este canal garante que o erro chegue até o app.
  let fail: (error: Error) => void = () => {};
  const failed = new Promise<never>((_, reject) => (fail = reject));
  failed.catch(() => {});
  const guard = <T>(promise: Promise<T>) => Promise.race([promise, failed]);

  const created = tesseract.createWorker(language, tesseract.OEM.LSTM_ONLY, {
    workerPath: new URL(worker.default, location.href).href,
    corePath: new URL(core.default, location.href).href,
    langPath: new URL(LANG_PATH, location.href).href,
    workerBlobURL: false,
    cacheMethod: "none",
    errorHandler: (error: unknown) =>
      fail(new Error(`Falha no reconhecimento de texto: ${String(error)}`)),
    logger: (m) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  const timer = setTimeout(
    () => fail(new Error("O reconhecimento de texto demorou demais para iniciar.")),
    INIT_TIMEOUT_MS,
  );
  let instance: Awaited<typeof created>;
  try {
    instance = await guard(created);
  } finally {
    clearTimeout(timer);
  }
  await guard(instance.setParameters({ user_defined_dpi: "300" }));

  const stop = () => {
    fail(new DOMException("Conversão cancelada.", "AbortError") as unknown as Error);
    void instance.terminate();
  };
  signal.addEventListener("abort", stop, { once: true });

  return {
    async recognize(image, scale = 1) {
      signal.throwIfAborted();
      const { data } = await guard(instance.recognize(image, {}, { blocks: true, text: false }));
      signal.throwIfAborted();
      return ocrPageToItems(data.blocks ?? [], image.height, scale);
    },
    async terminate() {
      signal.removeEventListener("abort", stop);
      await instance.terminate();
    },
  };
}

/** Estrutura mínima do resultado do Tesseract usada aqui (facilita testar sem o motor). */
export interface OcrBlock {
  paragraphs: {
    lines: {
      bbox: { x0: number; y0: number; x1: number; y1: number };
      rowAttributes?: { rowHeight: number } | undefined;
      words: {
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }[];
    }[];
  }[];
}

/**
 * Converte o resultado do OCR em itens de texto posicionados, no mesmo formato que o
 * pdf.js produz. Assim o motor de layout do PDF (títulos, parágrafos, listas, tabelas)
 * vale também para imagens. A imagem tem y para baixo; o PDF, para cima.
 */
export function ocrPageToItems(blocks: OcrBlock[], imageHeight: number, scale = 1): OcrPageResult {
  const items: PdfTextItem[] = [];
  let confidenceSum = 0;
  const lines = blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  for (const block of blocks) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        if (isPhantomLine(line, lines)) continue;
        // Todas as palavras da linha compartilham a mesma base e altura,
        // para não serem separadas por ascendentes/descendentes diferentes.
        const height = line.rowAttributes?.rowHeight || line.bbox.y1 - line.bbox.y0;
        const y = imageHeight - line.bbox.y1;
        for (const word of line.words) {
          const text = word.text.trim();
          if (!text || word.confidence < MIN_WORD_CONFIDENCE) continue;
          confidenceSum += word.confidence;
          items.push({
            // Cada item é uma palavra inteira: o espaço final garante a separação.
            str: `${text} `,
            x: word.bbox.x0 / scale,
            y: y / scale,
            width: (word.bbox.x1 - word.bbox.x0) / scale,
            height: height / scale,
          });
        }
      }
    }
  }
  return { items, confidence: items.length ? confidenceSum / items.length : 0 };
}

type OcrLine = OcrBlock["paragraphs"][number]["lines"][number];

/**
 * Acentos e marcas de fontes grandes (ex.: o til de "Prestação" num título) às vezes
 * viram uma "linha" própria com lixo como "Lad". Linhas de verdade não ficam quase
 * inteiras dentro da faixa vertical de outra linha bem mais alta: essas são descartadas.
 */
function isPhantomLine(line: OcrLine, all: OcrLine[]): boolean {
  const height = line.bbox.y1 - line.bbox.y0;
  if (height <= 0) return true;
  return all.some((other) => {
    if (other === line) return false;
    const otherHeight = other.bbox.y1 - other.bbox.y0;
    if (otherHeight < height * 1.3) return false;
    const overlap = Math.min(line.bbox.y1, other.bbox.y1) - Math.max(line.bbox.y0, other.bbox.y0);
    const horizontal =
      Math.min(line.bbox.x1, other.bbox.x1) - Math.max(line.bbox.x0, other.bbox.x0);
    return overlap >= height * 0.5 && horizontal > 0;
  });
}

/** Desenha uma imagem em canvas com fundo branco, corrigindo rotação e ajustando o tamanho. */
export async function imageToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const longest = Math.max(bitmap.width, bitmap.height);
  // Imagens pequenas ganham resolução (melhora o OCR); fotos enormes são reduzidas (velocidade).
  const scale = longest < 1200 ? 2 : longest > 3200 ? 3200 / longest : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não permitiu processar a imagem.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}
