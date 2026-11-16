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
  // Itens de lista com um espaço após o marcador ("- item"), em vez dos três do padrão.
  td.addRule("listItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement | null;
      let prefix = `${options.bulletListMarker} `;
      if (parent?.nodeName === "OL") {
        const start = Number(parent.getAttribute("start") ?? 1);
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      const indent = " ".repeat(prefix.length);
      const body = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "\n")
        .replace(/\n/gm, `\n${indent}`)
        .replace(new RegExp(`\\n${indent}$`), "\n");
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
    },
  });
  // "~~" é a forma de riscado mais compatível entre leitores de Markdown.
  td.addRule("strikethrough", {
    filter: ["del", "s"],
    replacement: (content) => (content.trim() ? `~~${content}~~` : content),
  });
  td.remove(["script", "style", "noscript"]);
  return td;
}

export function htmlToMarkdown(html: string): string {
  return createTurndown().turndown(html);
}
