import { describe, expect, it } from "vitest";
import { assessTextQuality } from "@/lib/text-quality";

const LONG_PT =
  "O Secretário Municipal de Administração, no uso de suas atribuições legais, torna público o resultado da licitação na modalidade pregão eletrônico, conforme as condições estabelecidas no edital e na legislação vigente, e convoca os interessados para a sessão de abertura das propostas.";

describe("qualidade do texto extraído", () => {
  it("texto normal em português (inclusive em maiúsculas) é legível", () => {
    expect(assessTextQuality(LONG_PT).garbled).toBe(false);
    expect(assessTextQuality(LONG_PT.toUpperCase()).garbled).toBe(false);
  });

  it("texto em inglês e espanhol também é legível", () => {
    const en =
      "The committee reviewed the report and agreed that the proposal is consistent with the policy for the region, and the results of the analysis are attached to this document for the board to evaluate in the next meeting of the year.";
    expect(assessTextQuality(en).garbled).toBe(false);
  });

  it("fonte sem mapa de caracteres (letras deslocadas e controle) é ilegível", () => {
    const shifted =
      "3UHIHLWXUD\u00030XQLFLSDO\u0003GH\u0003([HPSOR 2\u00036HFUHW£ULR\u00030XQLFLSDO\u0003GH\u0003$GPLQLVWUD©¥R";
    expect(assessTextQuality(shifted).garbled).toBe(true);
  });

  it("letras deslocadas mesmo sem caracteres de controle são ilegíveis", () => {
    const shifted = LONG_PT.replace(/[a-z]/gi, (c) =>
      String.fromCharCode(((c.toLowerCase().charCodeAt(0) - 97 + 3) % 26) + 97),
    );
    expect(assessTextQuality(shifted).garbled).toBe(true);
  });

  it("caracteres de uso privado indicam texto ilegível", () => {
    const pua = Array.from({ length: 40 }, (_, k) => String.fromCharCode(0xe000 + k)).join("");
    expect(
      assessTextQuality(`${pua.slice(0, 12)} ${pua.slice(12, 25)} ${pua.slice(25)}`).garbled,
    ).toBe(true);
  });

  it("páginas curtas, tabelas de números e listas de nomes não são julgadas", () => {
    expect(assessTextQuality("Página 12").garbled).toBe(false);
    expect(
      assessTextQuality("2023 2024 1.200,00 3.450,10 98% 12/05 R$ 4.000 15,2 33,1").garbled,
    ).toBe(false);
    expect(assessTextQuality("ANEXO I TABELA DE VALORES CÓDIGO ITEM QTD UNID").garbled).toBe(false);
  });
});
