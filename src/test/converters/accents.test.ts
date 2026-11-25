import { describe, expect, it } from "vitest";
import { fixDetachedDiacritics } from "@/lib/diacritics";
import { decodeBytes, encodingNotice } from "@/lib/encoding";
import { normalizeMarkdown } from "@/lib/markdown";

describe("acentos soltos em PDFs", () => {
  it.each([
    ["Prestac¸ ˜ao de servi c¸ os", "Prestação de serviços"],
    ["Munic´ıpio de Macei ´o", "Município de Maceió"],
    ["informac¸ ˜oes", "informações"],
    ["voc ˆe est´a", "você está"],
    ["`a vista", "à vista"],
    ["l ¨ungua", "lüngua"],
    ["ac¸ ˜ao", "ação"],
    ["n˜ao", "não"],
    ["AC¸ ˜AO", "AÇÃO"],
    ["e´ preciso", "é preciso"],
    ["sa ̃o", "são"],
  ])("%s → %s", (input, expected) => {
    expect(fixDetachedDiacritics(input)).toBe(expected);
  });

  it("não altera texto normal (e normaliza para NFC)", () => {
    expect(fixDetachedDiacritics("Ação e informação, até já.")).toBe("Ação e informação, até já.");
    expect(fixDetachedDiacritics("Ação")).toBe("Ação");
  });
});

describe("codificação de arquivos de texto", () => {
  const cp1252 = (s: string) =>
    Uint8Array.from(
      [...s].map((ch) => ({ ç: 0xe7, ã: 0xe3, ó: 0xf3, é: 0xe9, À: 0xc0 })[ch] ?? ch.charCodeAt(0)),
    );

  it("UTF-8 continua UTF-8", () => {
    const r = decodeBytes(new TextEncoder().encode("Ação"));
    expect(r).toEqual({ text: "Ação", encoding: "utf-8" });
    expect(encodingNotice(r.encoding)).toBeNull();
  });

  it("Windows-1252 (ANSI) é detectado quando não é UTF-8 válido", () => {
    const r = decodeBytes(cp1252("Ação e Relatório"));
    expect(r).toEqual({ text: "Ação e Relatório", encoding: "windows-1252" });
    expect(encodingNotice(r.encoding)).toMatch(/Windows-1252 \(ANSI\)/);
  });

  it("respeita o BOM do UTF-8 e do UTF-16", () => {
    expect(
      decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("é")])).text,
    ).toBe("é");
    expect(decodeBytes(new Uint8Array([0xff, 0xfe, 0xe7, 0x00])).text).toBe("ç");
  });

  it("usa o charset declarado no HTML", () => {
    const html = cp1252('<meta charset="iso-8859-1"><p>Relatório</p>');
    const r = decodeBytes(html, { html: true });
    expect(r.text).toContain("Relatório");
    expect(r.encoding).toBe("windows-1252");
  });
});

describe("normalização Unicode", () => {
  it("o Markdown final sai em NFC (acentos compostos)", () => {
    expect(normalizeMarkdown("Ação")).toBe("Ação\n");
  });
});
