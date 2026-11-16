import type { Converter } from "./types";
import { groupLines, markOcr, pdfLinesToMarkdown } from "./pdf-layout";
import { OCR_LANGUAGE_CHOICES, createOcrEngine, imageToCanvas, type OcrLanguage } from "@/lib/ocr";

/** Imagens (prints, fotos de documentos, digitalizações) convertidas por OCR. */
export const imageConverter: Converter = {
  id: "image",
  label: "Imagem (OCR)",
  extensions: [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".avif"],
  mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif", "image/avif"],
  options: [
    {
      type: "select",
      key: "ocrLang",
      label: "Idioma do texto",
      description: "Escolher o idioma certo melhora bastante o reconhecimento.",
      default: "por",
      choices: OCR_LANGUAGE_CHOICES,
    },
    {
      type: "boolean",
      key: "tables",
      label: "Detectar tabelas",
      description: "Transforma blocos com colunas alinhadas em tabelas Markdown.",
      default: true,
    },
  ],
  async convert(file, { options, onProgress, signal }) {
    const progress = (detail: string, done = 0) =>
      onProgress({ done, total: 100, unit: "%", detail });

    progress("Preparando a imagem…");
    const canvas = await imageToCanvas(file);
    progress("Carregando o reconhecimento de texto…");
    const ocr = await createOcrEngine(
      (options["ocrLang"] as OcrLanguage) ?? "por",
      signal,
      (fraction) => {
        const pct = Math.round(fraction * 100);
        progress(`Reconhecendo texto… ${pct}%`, pct);
      },
    );
    let result;
    try {
      result = await ocr.recognize(canvas);
    } finally {
      await ocr.terminate();
    }

    const markdown = pdfLinesToMarkdown([markOcr(groupLines(result.items))], {
      pageBreak: "none",
      tables: options["tables"] !== false,
    });
    const warnings: string[] = [];
    if (!markdown.trim()) {
      warnings.push("Nenhum texto reconhecido na imagem.");
    } else if (result.confidence < 70) {
      warnings.push(
        `Reconhecimento com confiança baixa (${Math.round(result.confidence)}%). Revise o texto: imagens nítidas, retas e com boa iluminação dão resultados melhores.`,
      );
    }
    return { markdown, assets: [], warnings };
  },
};
