import type { Converter } from "./types";
import { groupLines, pdfLinesToMarkdown, type PdfLine, type PdfLayoutOptions } from "./pdf-layout";

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
          // Agrupa em linhas já aqui: guarda muito menos dados que os itens brutos.
          pageLines.push(groupLines(items));
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
    }

    const markdown = pdfLinesToMarkdown(pageLines, {
      pageBreak: (options["pageBreak"] as PdfLayoutOptions["pageBreak"]) ?? "none",
      tables: options["tables"] !== false,
    });
    if (!markdown.trim()) {
      warnings.push(
        "Nenhum texto encontrado. O PDF provavelmente é escaneado (imagem); reconhecimento de texto (OCR) ainda não é suportado.",
      );
    }
    return { markdown, assets: [], warnings };
  },
};
