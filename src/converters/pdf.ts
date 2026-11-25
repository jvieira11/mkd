import type { Converter } from "./types";
import {
  groupLines,
  markOcr,
  pdfLinesToMarkdown,
  type PdfLine,
  type PdfLayoutOptions,
  type PdfTextItem,
} from "./pdf-layout";
import { parsePageRanges, selectPages } from "./pdf-pages";
import { MacRomanDetector, restoreUppercaseECircumflex } from "@/lib/mojibake";
import { largestImageCoverage } from "./pdf-images";
import { OCR_LANGUAGE_CHOICES, createOcrEngine, type OcrEngine, type OcrLanguage } from "@/lib/ocr";

/** Páginas com menos caracteres que isso são tratadas como digitalizadas (imagem). */
const MIN_TEXT_CHARS = 20;
/**
 * Páginas com pouco texto real (até isso) e uma imagem cobrindo boa parte da página
 * também são escaneadas: o texto é só um carimbo por cima ("Baixado em", nº da página).
 */
const SCANNED_MAX_TEXT_CHARS = 400;
const SCANNED_MIN_IMAGE_COVERAGE = 0.5;
/** Resolução de renderização para OCR: largura alvo em pixels de uma página. */
const OCR_TARGET_WIDTH = 2200;

export const pdfConverter: Converter = {
  id: "pdf",
  label: "PDF",
  extensions: [".pdf"],
  mimeTypes: ["application/pdf"],
  options: [
    {
      type: "boolean",
      key: "tables",
      label: "Detectar tabelas",
      description: "Transforma blocos com colunas alinhadas em tabelas Markdown.",
      default: true,
    },
    {
      type: "select",
      key: "pageBreak",
      label: "Separação de páginas",
      default: "none",
      choices: [
        { value: "none", label: "Nenhuma (texto contínuo)" },
        { value: "rule", label: "Linha horizontal (---)" },
        { value: "comment", label: "Comentário <!-- página N -->" },
      ],
    },
    {
      type: "select",
      key: "ocr",
      label: "Reconhecer texto em páginas escaneadas (OCR)",
      description: "Páginas que são só imagem passam por reconhecimento de texto. É mais lento.",
      default: "auto",
      choices: [
        { value: "auto", label: "Automático (só páginas sem texto)" },
        { value: "off", label: "Desligado" },
      ],
    },
    {
      type: "select",
      key: "ocrLang",
      label: "Idioma para OCR",
      default: "por",
      choices: OCR_LANGUAGE_CHOICES,
    },
    {
      type: "select",
      key: "maxPages",
      label: "Páginas a converter",
      description: "Útil para ter uma prévia rápida de PDFs muito grandes.",
      default: "all",
      choices: [
        { value: "all", label: "Todas" },
        { value: "10", label: "Primeiras 10" },
        { value: "50", label: "Primeiras 50" },
        { value: "200", label: "Primeiras 200" },
        { value: "custom", label: "Personalizado…" },
      ],
    },
    {
      type: "text",
      key: "pageRange",
      label: "Quais páginas",
      description: "Ex.: 3-7, ou várias faixas: 1-3, 5, 10-12. Use 8- para ir até o fim.",
      placeholder: "Ex.: 3-7",
      default: "",
      showWhen: { key: "maxPages", equals: "custom" },
      validate: (value) => parsePageRanges(value).error,
    },
  ],
  async convert(file, { options, onProgress, signal }) {
    const pdfjs = await import("pdfjs-dist");
    const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    // O pdf.js já faz a leitura pesada no próprio worker; aqui só recebemos o texto
    // de cada página, então a interface continua responsiva mesmo em PDFs grandes.
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      disableFontFace: true,
    });
    const abort = () => void task.destroy();
    signal.addEventListener("abort", abort, { once: true });

    const warnings: string[] = [];
    const pageLines: PdfLine[][] = [];
    const pageNumbers: number[] = [];
    const encodingDetector = new MacRomanDetector();
    const seenMarginText = new Set<string>();
    const useOcr = options["ocr"] !== "off";
    let ocr: OcrEngine | null = null;
    const ocrPages: number[] = [];
    let ocrConfidence = 0;
    try {
      const pdf = await task.promise;
      const { pages, notice } = selectPages(
        String(options["maxPages"] ?? "all"),
        String(options["pageRange"] ?? ""),
        pdf.numPages,
      );
      if (notice) warnings.push(notice);
      pageNumbers.push(...pages);
      const total = pages.length;
      onProgress({ done: 0, total, unit: "página" });

      for (const [index, n] of pages.entries()) {
        signal.throwIfAborted();
        try {
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          const raw: (PdfTextItem & { fontName: string; rotation: number })[] = [];
          for (const item of content.items) {
            if (!("str" in item)) continue;
            const [a = 1, b = 0, c = 0, d = 0, x = 0, y = 0] = item.transform as number[];
            raw.push({
              str: item.str,
              x,
              y,
              width: item.width,
              height: item.height || Math.hypot(c, d),
              fontName: item.fontName,
              rotation: Math.atan2(b, a),
            });
          }
          // Fontes gravadas em Windows-1252 mas declaradas como Mac Roman ("MUNICÕPIO").
          const fixed = encodingDetector.fixPage(raw);
          // Texto girado (carimbos de assinatura na margem) é lido à parte, na sua direção.
          const items = fixed.filter((i) => Math.abs(i.rotation) < 0.2);
          const rotated = fixed.filter((i) => Math.abs(i.rotation) >= 0.2).map(unrotate);
          const chars = items.reduce((n, i) => n + i.str.trim().length, 0);
          let scanned = chars < MIN_TEXT_CHARS;
          if (useOcr && !scanned && chars <= SCANNED_MAX_TEXT_CHARS) {
            const { fnArray, argsArray } = await page.getOperatorList();
            const { OPS } = pdfjs;
            const view = page.getViewport({ scale: 1 });
            const coverage = largestImageCoverage(
              fnArray,
              argsArray as unknown[][],
              {
                save: OPS.save,
                restore: OPS.restore,
                transform: OPS.transform,
                formBegin: OPS.paintFormXObjectBegin,
                formEnd: OPS.paintFormXObjectEnd,
                images: [
                  OPS.paintImageXObject,
                  OPS.paintInlineImageXObject,
                  OPS.paintImageMaskXObject,
                ],
              },
              view.width * view.height,
            );
            scanned = coverage >= SCANNED_MIN_IMAGE_COVERAGE;
          }
          if (useOcr && scanned) {
            // O OCR lê a página inteira, inclusive o texto real por cima da imagem,
            // então ele substitui (não soma) o texto extraído, evitando duplicação.
            // Página escaneada: desenha em alta resolução e reconhece o texto.
            const report = (fraction: number) =>
              onProgress({
                done: index,
                total,
                unit: "página",
                detail: `Reconhecendo texto (OCR) · página ${n} de ${pdf.numPages} · ${Math.round(fraction * 100)}%`,
              });
            report(0);
            ocr ??= await createOcrEngine(
              (options["ocrLang"] as OcrLanguage) ?? "por",
              signal,
              (f) => report(f),
            );
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(4, Math.max(1.5, OCR_TARGET_WIDTH / base.width));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, viewport, background: "#ffffff" }).promise;
            // `scale` devolve as coordenadas para pontos do PDF, como nas páginas com texto.
            const result = await ocr.recognize(canvas, scale);
            canvas.width = canvas.height = 0; // libera a memória do canvas
            ocrPages.push(n);
            ocrConfidence += result.confidence;
            pageLines.push(markOcr(groupLines(result.items)));
          } else {
            // Agrupa em linhas já aqui: guarda muito menos dados que os itens brutos.
            pageLines.push([...groupLines(items), ...marginText(rotated, seenMarginText)]);
          }
          page.cleanup();
        } catch (error) {
          signal.throwIfAborted();
          warnings.push(`A página ${n} não pôde ser lida e ficou de fora do resultado.`);
          pageLines.push([]);
        }
        onProgress({ done: index + 1, total, unit: "página" });
      }
    } finally {
      signal.removeEventListener("abort", abort);
      await task.destroy();
      await (ocr as OcrEngine | null)?.terminate();
    }

    if (encodingDetector.affected) {
      warnings.push(
        "Parte do texto deste PDF estava com os acentos gravados em codificação trocada (ex.: “MUNICÕPIO”). Os acentos foram corrigidos automaticamente.",
      );
    }
    if (ocrPages.length) {
      const avg = Math.round(ocrConfidence / ocrPages.length);
      warnings.push(
        `${ocrPages.length === 1 ? "1 página reconhecida" : `${ocrPages.length} páginas reconhecidas`} por OCR (confiança média ${avg}%). Revise o texto dessas páginas.`,
      );
    }

    let markdown = pdfLinesToMarkdown(pageLines, {
      pageBreak: (options["pageBreak"] as PdfLayoutOptions["pageBreak"]) ?? "none",
      tables: options["tables"] !== false,
      pageNumbers,
    });
    if (encodingDetector.affected) markdown = restoreUppercaseECircumflex(markdown);
    if (!markdown.trim()) {
      warnings.push(
        useOcr
          ? "Nenhum texto encontrado, nem com reconhecimento de texto (OCR)."
          : "Nenhum texto encontrado. O PDF parece escaneado: ative o OCR nas opções.",
      );
    }
    return { markdown, assets: [], warnings };
  },
};

/** Leva um texto girado para o sistema de coordenadas da sua própria direção de leitura. */
function unrotate<T extends PdfTextItem & { rotation: number }>(item: T): T {
  const cos = Math.cos(item.rotation);
  const sin = Math.sin(item.rotation);
  return { ...item, x: item.x * cos + item.y * sin, y: -item.x * sin + item.y * cos };
}

/**
 * Texto girado da margem (ex.: "Documento assinado eletronicamente por…") vira um
 * parágrafo separado no fim da página. Como costuma se repetir em todas as páginas,
 * aparece só na primeira vez.
 */
function marginText(items: PdfTextItem[], seen: Set<string>): PdfLine[] {
  if (!items.length) return [];
  const lines = groupLines(items);
  // Carimbos estreitos quebram linha até no meio de números ("às 1" / "1:35:09"):
  // junta tudo em um parágrafo, sem espaço quando a quebra cai entre dígitos.
  let text = "";
  for (const line of lines) {
    const glue = !text || (/\d$/.test(text) && /^\d/.test(line.text)) ? "" : " ";
    text += glue + line.text;
  }
  if (!text || seen.has(text)) return [];
  seen.add(text);
  const first = lines[0]!;
  return [
    { ...first, text, segments: [{ text, x: first.x, right: first.right }], breakBefore: true },
  ];
}
