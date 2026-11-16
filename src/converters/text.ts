import type { Converter } from "./types";

export const textConverter: Converter = {
  id: "text",
  label: "Texto",
  extensions: [".txt", ".md", ".markdown", ".text", ".log"],
  mimeTypes: ["text/plain", "text/markdown"],
  options: [
    {
      type: "boolean",
      key: "codeBlock",
      label: "Envolver em bloco de código",
      description: "Preserva o texto exatamente como está (útil para logs).",
      default: false,
    },
  ],
  async convert(file, { options }) {
    const text = await file.text();
    const markdown = options["codeBlock"] ? fence(text, "text") : text;
    return { markdown, assets: [], warnings: [] };
  },
};

export function fence(content: string, lang = ""): string {
  // Usa uma cerca maior do que qualquer sequência de crases no conteúdo.
  const longest = Math.max(2, ...(content.match(/`+/g) ?? []).map((m) => m.length));
  const marker = "`".repeat(longest + 1);
  return `${marker}${lang}\n${content.replace(/\n$/, "")}\n${marker}`;
}
