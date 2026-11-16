import type { Converter } from "./types";
import { pdfPagesToMarkdown, type PdfLayoutOptions, type PdfTextItem } from "./pdf-layout";

export const pdfConverter: Converter = {
  id: "pdf",
  label: "PDF",
  extensions: [".pdf"],
  mimeTypes: ["application/pdf"],
  options: [
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
  ],
  async convert(file, { options }) {
    const pdfjs = await import("pdfjs-dist");
    const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await task.promise;
    const pages: PdfTextItem[][] = [];
    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const items: PdfTextItem[] = [];
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
        pages.push(items);
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }

    const warnings: string[] = [];
    const markdown = pdfPagesToMarkdown(pages, {
      pageBreak: (options["pageBreak"] as PdfLayoutOptions["pageBreak"]) ?? "none",
    });
    if (!markdown.trim()) {
      warnings.push(
        "Nenhum texto encontrado. O PDF provavelmente é escaneado (imagem); reconhecimento de texto (OCR) ainda não é suportado.",
      );
    }
    return { markdown, assets: [], warnings };
  },
};
