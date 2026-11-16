import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { toMarkdownTable } from "./markdown";

/** Turndown configurado com GFM (tabelas, riscado, listas de tarefas). */
export function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  td.use(gfm);
  // Âncoras vazias (comuns em DOCX exportado) não devem virar links.
  td.addRule("emptyAnchors", {
    filter: (node) =>
      node.nodeName === "A" && !node.textContent?.trim() && !node.querySelector("img"),
    replacement: () => "",
  });
  // Converte qualquer tabela (o plugin GFM só aceita tabelas com <th>, raras em DOCX).
  // A primeira linha vira cabeçalho; conteúdo com várias linhas usa <br>.
  td.addRule("anyTable", {
    filter: "table",
    replacement: (_content, node) => {
      const table = node as HTMLTableElement;
      const rows = Array.from(table.rows)
        .filter((row) => row.closest("table") === table)
        .map((row) =>
          Array.from(row.cells).map((cell) =>
            td
              .turndown(cell.innerHTML)
              .replace(/\n{2,}/g, "<br>")
              .replace(/\n/g, " ")
              .replace(/\|/g, "\\|")
              .trim(),
          ),
        );
      return rows.length ? `\n\n${toMarkdownTable(rows, true, (c) => c)}\n\n` : "";
    },
  });
  td.remove(["script", "style", "noscript"]);
  return td;
}

export function htmlToMarkdown(html: string): string {
  return createTurndown().turndown(html);
}
