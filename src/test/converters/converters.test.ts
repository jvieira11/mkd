import { describe, expect, it } from "vitest";
import { convertFile, registry } from "@/converters";
import { makeDocx, makeOdt, makeXlsx } from "./fixtures";

const convert = async (file: File, options: Record<string, boolean | string> = {}) => {
  const converter = registry.find(file.name)!;
  return convertFile(converter, file, { ...registry.defaultOptions(converter), ...options });
};

describe("texto", () => {
  it("mantém o conteúdo e normaliza quebras de linha", async () => {
    const r = await convert(new File(["Olá\r\n\r\n\r\n\r\nmundo  "], "a.txt"));
    expect(r.markdown).toBe("Olá\n\nmundo\n");
  });

  it("envolve em bloco de código quando pedido, mesmo com crases no texto", async () => {
    const r = await convert(new File(["use ``` aqui"], "a.log"), { codeBlock: true });
    expect(r.markdown).toBe("````text\nuse ``` aqui\n````\n");
  });
});

describe("json", () => {
  it("transforma objetos em seções e listas de objetos em tabela", async () => {
    const data = {
      nome: "mkd",
      versao: 1,
      autores: [{ nome: "Ana", papel: "dev" }, { nome: "Bia" }],
      tags: ["a", "b"],
    };
    const r = await convert(new File([JSON.stringify(data)], "a.json"));
    expect(r.markdown).toContain("- **nome:** mkd");
    expect(r.markdown).toContain("# autores");
    expect(r.markdown).toContain("| nome | papel |");
    expect(r.markdown).toContain("| Bia |  |");
    expect(r.markdown).toContain("# tags\n\n- a\n- b");
  });

  it("modo código gera bloco json formatado", async () => {
    const r = await convert(new File(['{"a":1}'], "a.json"), { mode: "code" });
    expect(r.markdown).toBe('```json\n{\n  "a": 1\n}\n```\n');
  });

  it("JSON inválido não quebra: vira bloco de código com aviso", async () => {
    const r = await convert(new File(["{ruim"], "a.json"));
    expect(r.warnings[0]).toMatch(
      /^JSON inválido \(linha 1, coluna \d+\)\. O conteúdo foi mantido/,
    );
    expect(r.markdown).toContain("```json");
  });

  it("aceita JSON Lines", async () => {
    const r = await convert(new File(['{"a":1}\n{"a":2}\n'], "a.jsonl"));
    expect(r.markdown).toContain("| a |\n| --- |\n| 1 |\n| 2 |");
  });
});

describe("docx", () => {
  it("converte títulos, negrito, listas e tabelas", async () => {
    const file = await makeDocx(`
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Relatório</w:t></w:r></w:p>
      <w:p><w:r><w:t xml:space="preserve">Texto com </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>negrito</w:t></w:r></w:p>
      <w:tbl>
        <w:tr><w:tc><w:p><w:r><w:t>Nome</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Idade</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>Ana</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>30</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl>`);
    const r = await convert(file);
    expect(r.markdown).toContain("# Relatório");
    expect(r.markdown).toContain("Texto com **negrito**");
    expect(r.markdown).toMatch(/\| Nome \| Idade \|\n\| -+ \| -+ \|\n\| Ana \| 30 \|/);
  });
});

describe("odt (Google Docs / LibreOffice)", () => {
  it("converte títulos, estilos, links, listas e tabelas", async () => {
    const styles = `
      <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
      <style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
      <text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style>`;
    const file = await makeOdt(
      `<text:h text:outline-level="2">Seção</text:h>
       <text:p>Um <text:span text:style-name="T1">forte</text:span> e <text:span text:style-name="T2">leve </text:span><text:a xlink:href="https://exemplo.com">link</text:a>.</text:p>
       <text:list><text:list-item><text:p>item 1</text:p><text:list><text:list-item><text:p>sub</text:p></text:list-item></text:list></text:list-item><text:list-item><text:p>item 2</text:p></text:list-item></text:list>
       <text:list text:style-name="L1"><text:list-item><text:p>primeiro</text:p></text:list-item><text:list-item><text:p>segundo</text:p></text:list-item></text:list>
       <table:table><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>1</text:p></table:table-cell><table:table-cell><text:p>2</text:p></table:table-cell></table:table-row></table:table>`,
      styles,
    );
    const r = await convert(file);
    expect(r.markdown).toContain("## Seção");
    expect(r.markdown).toContain("Um **forte** e *leve* [link](https://exemplo.com).");
    expect(r.markdown).toContain("- item 1\n   - sub\n- item 2");
    expect(r.markdown).toContain("1. primeiro\n2. segundo");
    expect(r.markdown).toContain("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });
});

describe("xlsx", () => {
  it("gera uma tabela por aba", async () => {
    const file = await makeXlsx({
      Vendas: [
        ["Produto", "Qtd"],
        ["Caneta", 10],
        ["Lápis", 5],
      ],
      Resumo: [["Total", 15]],
    });
    const r = await convert(file);
    expect(r.markdown).toContain(
      "## Vendas\n\n| Produto | Qtd |\n| --- | --- |\n| Caneta | 10 |\n| Lápis | 5 |",
    );
    expect(r.markdown).toContain("## Resumo");
  });

  it("omite o título com uma aba só e respeita o limite de linhas", async () => {
    const file = await makeXlsx({ Dados: [["n"], [1], [2], [3]] });
    const r = await convert(file, { maxRows: "100" });
    expect(r.markdown.startsWith("| n |")).toBe(true);
    const sem = await convert(file, { header: false });
    expect(sem.markdown).toContain("| Coluna 1 |");
  });
});

describe("html", () => {
  it("converte tabelas sem cabeçalho e escapa barras verticais", async () => {
    const html = `<html><head><title>Página</title></head><body><p>Oi</p><table><tr><td>a|b</td><td><p>x</p><p>y</p></td></tr><tr><td>1</td><td>2</td></tr></table></body></html>`;
    const r = await convert(new File([html], "a.html"));
    expect(r.markdown).toBe("# Página\n\nOi\n\n| a\\|b | x<br>y |\n| --- | --- |\n| 1 | 2 |\n");
  });
});

describe("html colado do Google Docs", () => {
  it("entende negrito/itálico por CSS e ignora o <b> que envolve tudo", async () => {
    const html = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><p dir="ltr"><span style="font-weight:400;">Texto </span><span style="font-weight:700;">forte</span><span style="font-weight:400;"> e </span><span style="font-style:italic;">leve</span><span style="text-decoration:line-through;"> velho</span></p></b>`;
    const r = await convert(new File([html], "colado-1.html", { type: "text/html" }));
    expect(r.markdown).toBe("Texto **forte** e *leve* ~~velho~~\n");
  });
});

describe("listas em HTML", () => {
  it("usa um espaço após o marcador e indenta subníveis", async () => {
    const html = `<ul><li>um</li><li>dois<ul><li>sub</li></ul></li></ul><ol start="3"><li>três</li><li>quatro</li></ol>`;
    const r = await convert(new File([html], "a.html"));
    expect(r.markdown).toBe("- um\n- dois\n  - sub\n\n3. três\n4. quatro\n");
  });
});
