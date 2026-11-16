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
      { pageBreak: "none", tables: true },
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
      { pageBreak: "none", tables: true },
    );
    expect(md).toBe("Texto com conversão quebrada.\n\n- primeiro\n- segundo");
  });

  it("junta itens da mesma linha com espaço e separa páginas", () => {
    const items: PdfTextItem[] = [
      { str: "Olá", x: 50, y: 700, width: 20, height: 11 },
      { str: "mundo", x: 75, y: 700.5, width: 30, height: 11 },
    ];
    const md = pdfPagesToMarkdown([items, items], { pageBreak: "rule", tables: true });
    expect(md).toBe("Olá mundo\n\n---\n\nOlá mundo");
    expect(pdfPagesToMarkdown([items, items], { pageBreak: "comment", tables: true })).toContain(
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
      { pageBreak: "none", tables: true },
    );
    expect(md).toBe(
      "Uma linha longa de texto que ocupa quase toda a largura útil da página.\n\nReceita: R$ 1,2 milhão\n\nClientes novos: 340",
    );
  });

  it("retorna vazio para PDF sem texto", () => {
    expect(pdfPagesToMarkdown([[], []], { pageBreak: "none", tables: true })).toBe("");
  });

  describe("tabelas", () => {
    /** Linha com células em posições x fixas (largura proporcional ao texto). */
    const row = (y: number, cells: [string, number][], size = 10): PdfTextItem[] =>
      cells.map(([str, x]) => ({ str, x, y, width: str.length * size * 0.5, height: size }));

    const text = (y: number, str: string): PdfTextItem => ({
      str,
      x: 50,
      y,
      width: str.length * 5,
      height: 10,
    });

    it("converte colunas alinhadas em tabela Markdown, mantendo o texto ao redor", () => {
      const items = [
        text(700, "Resumo das vendas do mês de outubro."),
        ...row(670, [
          ["Produto", 50],
          ["Qtd", 200],
          ["Preço", 300],
        ]),
        ...row(655, [
          ["Caneta azul", 50],
          ["10", 200],
          ["R$ 2,00", 300],
        ]),
        ...row(640, [
          ["Lápis", 50],
          ["5", 200],
          ["R$ 1,50", 300],
        ]),
        text(610, "Fim do relatório."),
      ];
      const md = pdfPagesToMarkdown([items], { pageBreak: "none", tables: true });
      expect(md).toBe(
        [
          "Resumo das vendas do mês de outubro.",
          "| Produto | Qtd | Preço |\n| --- | --- | --- |\n| Caneta azul | 10 | R$ 2,00 |\n| Lápis | 5 | R$ 1,50 |",
          "Fim do relatório.",
        ].join("\n\n"),
      );
    });

    it("aceita números alinhados à direita e células vazias", () => {
      const items = [
        ...row(670, [
          ["Item", 50],
          ["Jan", 200],
          ["Fev", 300],
        ]),
        ...row(655, [
          ["Aluguel", 50],
          ["1.200", 190],
          ["1.200", 290],
        ]),
        ...row(640, [
          ["Luz", 50],
          ["95", 205],
        ]),
      ];
      const md = pdfPagesToMarkdown([items], { pageBreak: "none", tables: true });
      expect(md).toBe(
        "| Item | Jan | Fev |\n| --- | --- | --- |\n| Aluguel | 1.200 | 1.200 |\n| Luz | 95 |  |",
      );
    });

    it("escapa barras verticais dentro das células", () => {
      const items = [
        ...row(670, [
          ["A|B", 50],
          ["C", 200],
        ]),
        ...row(655, [
          ["1", 50],
          ["2", 200],
        ]),
      ];
      expect(pdfPagesToMarkdown([items], { pageBreak: "none", tables: true })).toBe(
        "| A\\|B | C |\n| --- | --- |\n| 1 | 2 |",
      );
    });

    it("não confunde texto em duas colunas com tabela", () => {
      const left = "Este é um texto corrido na coluna da esquerda";
      const right = "e este outro texto corrido fica na coluna da direita";
      const items = [
        ...row(700, [
          [left, 50],
          [right, 320],
        ]),
        ...row(686, [
          [left, 50],
          [right, 320],
        ]),
        ...row(672, [
          [left, 50],
          [right, 320],
        ]),
      ];
      const md = pdfPagesToMarkdown([items], { pageBreak: "none", tables: true });
      expect(md).not.toContain("|");
    });

    it("não divide frases com espaçamento normal entre palavras", () => {
      const words = ["Uma", "frase", "comum", "com", "palavras", "separadas"];
      let x = 50;
      const items = words.map((str) => {
        const item = { str, x, y: 700, width: str.length * 5, height: 10 };
        x += item.width + 3;
        return item;
      });
      const line = { ...items[0]!, y: 685 };
      const md = pdfPagesToMarkdown([[...items, line]], { pageBreak: "none", tables: true });
      expect(md).not.toContain("|");
      expect(md).toContain("Uma frase comum com palavras separadas");
    });

    it("pode ser desligada", () => {
      const items = [
        ...row(670, [
          ["Produto", 50],
          ["Qtd", 200],
        ]),
        ...row(655, [
          ["Caneta", 50],
          ["10", 200],
        ]),
      ];
      const md = pdfPagesToMarkdown([items], { pageBreak: "none", tables: false });
      expect(md).not.toContain("|");
      expect(md).toContain("Produto Qtd");
    });
  });
});
