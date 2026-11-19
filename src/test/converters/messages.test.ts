import { describe, expect, it } from "vitest";
import { summarizeWarnings, translateError, translateWarning } from "@/lib/messages";

describe("mensagens em português", () => {
  it("agrupa estilos do Word não reconhecidos em um único aviso", () => {
    const out = summarizeWarnings([
      "Unrecognised paragraph style: 'Normal (Web)' (Style ID: NormalWeb)",
      "Unrecognised paragraph style: 'Normal (Web)' (Style ID: NormalWeb)",
      "Unrecognised paragraph style: 'Corpo de texto' (Style ID: BodyText)",
      "Unrecognised run style: 'Forte' (Style ID: Strong)",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(
      "O documento usa estilos do Word sem equivalente em Markdown (parágrafo: “Normal (Web)”, “Corpo de texto”; texto: “Forte”). O texto foi convertido normalmente; esses trechos ficaram como texto comum.",
    );
  });

  it("traduz avisos conhecidos e mantém os que já estão em português", () => {
    expect(translateWarning("An unrecognised element was ignored: w:customXml")).toBe(
      "Um elemento do documento não é suportado e foi ignorado (w:customXml).",
    );
    expect(
      translateWarning("Image of type image/x-emf is unlikely to display in web browsers"),
    ).toMatch(/^Uma imagem está em um formato que os navegadores não exibem \(image\/x-emf\)/);
    expect(translateWarning('Aba "Vendas": exibindo 100 de 500 linhas.')).toBe(
      'Aba "Vendas": exibindo 100 de 500 linhas.',
    );
    expect(translateWarning("Something new happened")).toBe(
      "Aviso técnico da conversão: Something new happened",
    );
  });

  it("agrupa estilos citados mas inexistentes e remove repetições", () => {
    const out = summarizeWarnings([
      "Paragraph style with ID Heading9 was referenced but not defined in the document",
      "Run style with ID Emph was referenced but not defined in the document",
      "Unsupported break type: column",
      "Unsupported break type: column",
    ]);
    expect(out).toEqual([
      "O documento cita estilos que não existem nele (Heading9, Emph). O texto foi mantido, sem essa formatação.",
      "Um tipo de quebra não suportado foi ignorado (column).",
    ]);
  });

  it("traduz erros comuns de arquivos", () => {
    expect(
      translateError(new Error("Can't find end of central directory : is this a zip file ?")),
    ).toMatch(/^O arquivo não pôde ser aberto: ele pode estar protegido por senha/);
    const pdfPassword = Object.assign(new Error("No password given"), {
      name: "PasswordException",
    });
    expect(translateError(pdfPassword)).toBe(
      "Este PDF é protegido por senha. Remova a senha e tente de novo.",
    );
    expect(translateError(new Error("Invalid PDF structure."))).toBe(
      "O PDF parece estar corrompido ou incompleto.",
    );
    expect(translateError(new Error("Formato não suportado."))).toBe("Formato não suportado.");
    expect(translateError(new Error("weird failure"))).toBe(
      "Não foi possível converter este arquivo. Detalhe técnico: weird failure",
    );
  });
});
