import type { Converter } from "./types";
import {
  groupLines,
  markOcr,
  pdfLinesToMarkdown,
  type PdfLine,
  type PdfLayoutOptions,
} from "./pdf-layout";
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
      ],
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
    const useOcr = options["ocr"] !== "off";
    let ocr: OcrEngine | null = null;
    const ocrPages: number[] = [];
    let ocrConfidence = 0;
    try {
      const pdf = await task.promise;
      const limit = options["maxPages"] === "all" ? Infinity : Number(options["maxPages"]);
      const total = Math.min(pdf.numPages, limit);
      if (pdf.numPages > total) {
        warnings.push(`Convertidas as primeiras ${total} de ${pdf.numPages} páginas.`);
      }
      onProgress({ done: 0, total, unit: "página" });

      for (let n = 1; n <= total; n++) {
        signal.throwIfAborted();
        try {
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          const items = [];
          for (const item of content.items) {
            if (!("str" in item)) continue;
            const [, , , d = 0, x = 0, y = 0] = item.transform as number[];
            items.push({
              str: item.str,
              x,
              y,
              width: item.width,
              height: item.height || Math.abs(d),
            });
          }
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
                done: n - 1,
                total,
                unit: "página",
                detail: `Reconhecendo texto (OCR) · página ${n} de ${total} · ${Math.round(fraction * 100)}%`,
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
            pageLines.push(groupLines(items));
          }
          page.cleanup();
        } catch (error) {
          signal.throwIfAborted();
          warnings.push(`Página ${n} não pôde ser lida: ${(error as Error).message}`);
          pageLines.push([]);
        }
        onProgress({ done: n, total, unit: "página" });
      }
    } finally {
      signal.removeEventListener("abort", abort);
      await task.destroy();
      await (ocr as OcrEngine | null)?.terminate();
    }

    if (ocrPages.length) {
      const avg = Math.round(ocrConfidence / ocrPages.length);
      warnings.push(
        `${ocrPages.length === 1 ? "1 página reconhecida" : `${ocrPages.length} páginas reconhecidas`} por OCR (confiança média ${avg}%). Revise o texto dessas páginas.`,
      );
    }

    const markdown = pdfLinesToMarkdown(pageLines, {
      pageBreak: (options["pageBreak"] as PdfLayoutOptions["pageBreak"]) ?? "none",
      tables: options["tables"] !== false,
    });
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
