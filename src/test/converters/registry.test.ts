import { describe, expect, it } from "vitest";
import { registry } from "@/converters";
import { ConverterRegistry, getExtension } from "@/converters/registry";
import { textConverter } from "@/converters/text";

describe("registry", () => {
  it("encontra o conversor pela extensão, ignorando maiúsculas", () => {
    expect(registry.find("Relatório.PDF")?.id).toBe("pdf");
    expect(registry.find("a.docx")?.id).toBe("docx");
    expect(registry.find("a.odt")?.id).toBe("odt");
    expect(registry.find("a.xlsx")?.id).toBe("xlsx");
    expect(registry.find("a.json")?.id).toBe("json");
    expect(registry.find("a.txt")?.id).toBe("text");
  });

  it("usa o MIME type quando não há extensão conhecida", () => {
    expect(registry.find("sem-extensao", "application/pdf")?.id).toBe("pdf");
  });

  it("retorna undefined para formatos desconhecidos", () => {
    expect(registry.find("foto.heic", "image/heic")).toBeUndefined();
  });

  it("recusa ids duplicados", () => {
    const r = new ConverterRegistry().register(textConverter);
    expect(() => r.register(textConverter)).toThrow();
  });

  it("gera o atributo accept e as opções padrão", () => {
    expect(registry.acceptAttribute()).toContain(".pdf");
    expect(registry.defaultOptions(registry.get("xlsx")!)).toEqual({
      header: true,
      maxRows: "all",
    });
  });

  it("extrai extensões corretamente", () => {
    expect(getExtension(".bashrc")).toBe("");
    expect(getExtension("a.b.TXT")).toBe(".txt");
  });
});
