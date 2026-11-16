import { describe, expect, it } from "vitest";
import { pdfPagesToMarkdown, type PdfTextItem } from "@/converters/pdf-layout";

/** Cria itens de texto: cada linha [texto, tamanho], de cima para baixo. */
function page(lines: [string, number, number?][]): PdfTextItem[] {
  let y = 800;
  return lines.map(([str, height, gap]) => {
    y -= gap ?? height * 1.2;
    return { str, x: 50, y, width: str.length * height * 0.5, height };
  });
}

describe("pdf-layout", () => {
  it("detecta títulos pelo tamanho da fonte e junta linhas do mesmo parágrafo", () => {
    const md = pdfPagesToMarkdown(
      [
        page([
          ["Relatório Anual", 24],
          ["Introdução", 16, 30],
          ["Esta é a primeira linha do parágrafo que", 11, 24],
          ["continua aqui.", 11],
          ["Novo parágrafo depois de um espaço maior.", 11, 30],
        ]),
      ],
      { pageBreak: "none" },
    );
    expect(md).toBe(
      "# Relatório Anual\n\n## Introdução\n\nEsta é a primeira linha do parágrafo que continua aqui.\n\nNovo parágrafo depois de um espaço maior.",
    );
  });

  it("desfaz hifenização e converte marcadores em lista", () => {
    const md = pdfPagesToMarkdown(
      [
        page([
          ["Texto com conver-", 11],
          ["são quebrada.", 11],
          ["• primeiro", 11, 20],
          ["• segundo", 11],
        ]),
      ],
      { pageBreak: "none" },
    );
    expect(md).toBe("Texto com conversão quebrada.\n\n- primeiro\n- segundo");
  });

  it("junta itens da mesma linha com espaço e separa páginas", () => {
    const items: PdfTextItem[] = [
      { str: "Olá", x: 50, y: 700, width: 20, height: 11 },
      { str: "mundo", x: 75, y: 700.5, width: 30, height: 11 },
    ];
    const md = pdfPagesToMarkdown([items, items], { pageBreak: "rule" });
    expect(md).toBe("Olá mundo\n\n---\n\nOlá mundo");
    expect(pdfPagesToMarkdown([items, items], { pageBreak: "comment" })).toContain(
      "<!-- página 2 -->",
    );
  });

  it("linhas curtas consecutivas não viram um único parágrafo", () => {
    const md = pdfPagesToMarkdown(
      [
        page([
          ["Uma linha longa de texto que ocupa quase toda a largura útil da página.", 11],
          ["Receita: R$ 1,2 milhão", 11, 20],
          ["Clientes novos: 340", 11],
        ]),
      ],
      { pageBreak: "none" },
    );
    expect(md).toBe(
      "Uma linha longa de texto que ocupa quase toda a largura útil da página.\n\nReceita: R$ 1,2 milhão\n\nClientes novos: 340",
    );
  });

  it("retorna vazio para PDF sem texto", () => {
    expect(pdfPagesToMarkdown([[], []], { pageBreak: "none" })).toBe("");
  });
});
