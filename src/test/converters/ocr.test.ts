import { describe, expect, it } from "vitest";
import { ocrPageToItems, type OcrBlock } from "@/lib/ocr";
import { groupLines, pdfLinesToMarkdown } from "@/converters/pdf-layout";
import { registry } from "@/converters";

/** Monta uma linha de OCR: palavras [texto, x0, largura], no topo `top` (pixels, y para baixo). */
function line(top: number, height: number, words: [string, number, number][], confidence = 90) {
  return {
    bbox: { x0: words[0]![1], y0: top, x1: 0, y1: top + height },
    words: words.map(([text, x0, w]) => ({
      text,
      confidence,
      bbox: { x0, y0: top, x1: x0 + w, y1: top + height },
    })),
  };
}

const page = (lines: ReturnType<typeof line>[]): OcrBlock[] => [{ paragraphs: [{ lines }] }];

const toMarkdown = (blocks: OcrBlock[], height = 1000) =>
  pdfLinesToMarkdown([groupLines(ocrPageToItems(blocks, height).items)], {
    pageBreak: "none",
    tables: true,
  });

describe("OCR → Markdown", () => {
  it("reconstrói título e parágrafo com espaços entre as palavras", () => {
    const md = toMarkdown(
      page([
        line(100, 48, [["Relatório", 100, 260]]),
        line(200, 24, [
          ["Texto", 100, 70],
          ["da", 175, 25],
          ["primeira", 205, 100],
          ["linha", 310, 60],
        ]),
        line(230, 24, [
          ["continua", 100, 100],
          ["aqui.", 205, 60],
        ]),
      ]),
    );
    expect(md).toBe("# Relatório\n\nTexto da primeira linha continua aqui.");
  });

  it("ignora acentos de títulos grandes reconhecidos como uma linha à parte", () => {
    const title = line(134, 73, [
      ["Contrato", 120, 300],
      ["Prestação", 548, 330],
    ]);
    title.bbox.x1 = 1281;
    const ghost = line(
      129,
      26,
      [
        ["Lad", 802, 35],
        ["LL", 1160, 12],
      ],
      60,
    );
    ghost.bbox.x1 = 1172;
    const md = toMarkdown(
      page([
        ghost,
        title,
        line(273, 30, [
          ["Um", 117, 40],
          ["parágrafo", 165, 140],
          ["comum", 315, 90],
          ["de", 415, 30],
          ["texto", 455, 70],
          ["corrido.", 535, 110],
        ]),
      ]),
    );
    expect(md).toBe("# Contrato Prestação\n\nUm parágrafo comum de texto corrido.");
  });

  it("descarta palavras com confiança muito baixa (ruído)", () => {
    const { items, confidence } = ocrPageToItems(
      [
        {
          paragraphs: [
            {
              lines: [
                {
                  ...line(100, 24, [["Olá", 100, 50]]),
                  words: [
                    { text: "Olá", confidence: 95, bbox: { x0: 100, y0: 100, x1: 150, y1: 124 } },
                    { text: "~#", confidence: 10, bbox: { x0: 160, y0: 100, x1: 180, y1: 124 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
      1000,
    );
    expect(items.map((i) => i.str.trim())).toEqual(["Olá"]);
    expect(confidence).toBe(95);
  });

  it("descarta linhas muito menos confiáveis que o resto (brasões, assinaturas)", () => {
    const withConfidence = (l: ReturnType<typeof line>, confidence: number) => ({
      ...l,
      confidence,
    });
    const { items } = ocrPageToItems(
      page([
        withConfidence(
          line(
            100,
            24,
            [
              ["Texto", 100, 70],
              ["real", 180, 50],
            ],
            95,
          ),
          95,
        ),
        withConfidence(
          line(
            130,
            24,
            [
              ["outra", 100, 70],
              ["linha", 180, 60],
            ],
            96,
          ),
          96,
        ),
        withConfidence(
          line(
            160,
            24,
            [
              ["mais", 100, 60],
              ["uma", 170, 50],
            ],
            94,
          ),
          94,
        ),
        withConfidence(
          line(
            300,
            60,
            [
              ["SS", 600, 40],
              ["7", 650, 10],
              ["Pp", 670, 30],
            ],
            60,
          ),
          41,
        ),
      ]),
      1000,
    );
    expect(items.map((i) => i.str.trim())).toEqual([
      "Texto",
      "real",
      "outra",
      "linha",
      "mais",
      "uma",
    ]);
  });

  it("detecta tabelas em imagens", () => {
    const md = toMarkdown(
      page([
        line(100, 24, [
          ["Produto", 100, 90],
          ["Qtd", 400, 40],
        ]),
        line(130, 24, [
          ["Caneta", 100, 80],
          ["10", 400, 25],
        ]),
        line(160, 24, [
          ["Lápis", 100, 60],
          ["5", 400, 12],
        ]),
      ]),
    );
    expect(md).toBe("| Produto | Qtd |\n| --- | --- |\n| Caneta | 10 |\n| Lápis | 5 |");
  });

  it("converte pixels para pontos com a escala (páginas de PDF)", () => {
    const { items } = ocrPageToItems(page([line(100, 24, [["A", 200, 20]])]), 1000, 2);
    expect(items[0]).toMatchObject({ x: 100, y: (1000 - 124) / 2, width: 10, height: 12 });
  });

  it("imagens são reconhecidas pelo registro", () => {
    expect(registry.find("foto.JPG")?.id).toBe("image");
    expect(registry.find("print", "image/png")?.id).toBe("image");
  });
});
