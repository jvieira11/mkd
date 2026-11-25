import { describe, expect, it } from "vitest";
import {
  MacRomanDetector,
  fixMacRoman,
  measureMacRoman,
  restoreUppercaseECircumflex,
} from "@/lib/mojibake";
import {
  describePages,
  expandPageRanges,
  parsePageRanges,
  selectPages,
} from "@/converters/pdf-pages";

describe("acentos em codificação trocada (Windows-1252 lido como Mac Roman)", () => {
  it.each([
    ["”RG√O RESPONS¡VEL", "ÓRGÃO RESPONSÁVEL"],
    ["FUNDA«√O UNIVERSIT¡RIA", "FUNDAÇÃO UNIVERSITÁRIA"],
    ["PROCESSO N∫:", "PROCESSO Nº:"],
    ["com o que dispıe o art. 53", "com o que dispõe o art. 53"],
    ["Org‚nica da Procuradoria Geral do MunicÌpio", "Orgânica da Procuradoria Geral do Município"],
    ["inexigibilidade de chamamento p˙blico", "inexigibilidade de chamamento público"],
    ["depender· de parecer prÈvio", "dependerá de parecer prévio"],
    ["DEFICI NCIA", "DEFICIÊNCIA"],
    ["MUNICÕPIO", "MUNICÍPIO"],
  ])("%s → %s", (input, expected) => {
    expect(fixMacRoman(input)).toBe(expected);
  });

  it("detecta por fonte: corrige só a fonte afetada", () => {
    const detector = new MacRomanDetector();
    const out = detector.fixPage([
      { str: "PROCESSO N∫:", fontName: "f5" },
      { str: "”RG√O RESPONS¡VEL:", fontName: "f5" },
      { str: "a “transferência de recursos”", fontName: "f7" },
      { str: "MACEI”", fontName: "f2" },
    ]);
    expect(out.map((i) => i.str)).toEqual([
      "PROCESSO Nº:",
      "ÓRGÃO RESPONSÁVEL:",
      "a “transferência de recursos”",
      "MACEIÓ",
    ]);
    expect(detector.affected).toBe(true);
  });

  it("recupera o Ê maiúsculo que virou espaço", () => {
    expect(
      restoreUppercaseECircumflex(
        "PESSOAS COM DEFICI NCIA, COMPET NCIA DA PGM, EXIG NCIAS DA LDO, G NEROS ACAD MICOS",
      ),
    ).toBe("PESSOAS COM DEFICIÊNCIA, COMPETÊNCIA DA PGM, EXIGÊNCIAS DA LDO, GÊNEROS ACADÊMICOS");
    // Prefixo de uma letra só (exceto "G NERO") e texto minúsculo não são alterados.
    expect(restoreUppercaseECircumflex("A NCIA citada e a deficiência")).toBe(
      "A NCIA citada e a deficiência",
    );
  });

  it("não mexe em PDFs corretos, mesmo com aspas e acentos", () => {
    const detector = new MacRomanDetector();
    const items = [
      { str: "A “Prestação de Serviços” será feita no Município.", fontName: "f1" },
      { str: "Ele disse “sim”", fontName: "f2" },
    ];
    expect(detector.fixPage(items)).toEqual(items);
    expect(detector.affected).toBe(false);
    expect(measureMacRoman("transferência").against).toBeGreaterThan(0);
  });
});

describe("intervalo de páginas", () => {
  it("aceita faixas, páginas soltas, 'a' e 'até o fim'", () => {
    expect(parsePageRanges("3-7").ranges).toEqual([{ start: 3, end: 7 }]);
    expect(parsePageRanges("1-3, 5; 10 a 12").ranges).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 10, end: 12 },
    ]);
    expect(parsePageRanges("8-").ranges).toEqual([{ start: 8, end: null }]);
    expect(parsePageRanges("2 até 4").ranges).toEqual([{ start: 2, end: 4 }]);
  });

  it("explica erros em português", () => {
    expect(parsePageRanges("").error).toBe("Digite as páginas, por exemplo 3-7.");
    expect(parsePageRanges("7-3").error).toMatch(/página final é menor que a inicial/);
    expect(parsePageRanges("abc").error).toMatch(/Não entendi “abc”/);
    expect(parsePageRanges("0-2").error).toBe("As páginas começam em 1.");
  });

  it("expande, ordena, remove repetições e respeita o total de páginas", () => {
    const { ranges } = parsePageRanges("5, 1-3, 2, 12-");
    expect(expandPageRanges(ranges, 14)).toEqual([1, 2, 3, 5, 12, 13, 14]);
    expect(describePages([1, 2, 3, 5, 12, 13, 14])).toBe("1–3, 5, 12–14");
  });

  it("seleciona as páginas conforme a opção escolhida", () => {
    expect(selectPages("all", "", 3)).toEqual({ pages: [1, 2, 3], notice: null });
    expect(selectPages("10", "", 14).notice).toBe("Convertidas as primeiras 10 de 14 páginas.");
    expect(selectPages("custom", "3-7", 14)).toEqual({
      pages: [3, 4, 5, 6, 7],
      notice: "Convertidas as páginas 3–7 de 14.",
    });
    expect(selectPages("custom", "12-20", 14).notice).toBe(
      "Convertidas as páginas 12–14 de 14. Páginas além da 14 foram ignoradas.",
    );
    expect(() => selectPages("custom", "20-30", 14)).toThrow(
      "Este PDF tem 14 páginas; nenhuma das páginas pedidas (20-30) existe.",
    );
  });
});
