import type {
  Converter,
  ConversionProgress,
  ConversionResult,
  ConverterOptionValues,
} from "./types";
import { getBaseName } from "./registry";
import { normalizeMarkdown } from "@/lib/markdown";
import { summarizeWarnings } from "@/lib/messages";
import { fixUtf8AsWindows1252 } from "@/lib/mojibake";

export interface ConvertFileExtras {
  onProgress?: (progress: ConversionProgress) => void;
  signal?: AbortSignal;
}

/** Executa um conversor e aplica o pós-processamento comum a todos os formatos. */
export async function convertFile(
  converter: Converter,
  file: File,
  options: ConverterOptionValues,
  extras: ConvertFileExtras = {},
): Promise<ConversionResult> {
  const signal = extras.signal ?? new AbortController().signal;
  const result = await converter.convert(file, {
    options,
    assetDir: assetDirFor(file.name),
    onProgress: extras.onProgress ?? (() => {}),
    signal,
  });
  signal.throwIfAborted();
  // Acentos corrompidos por um sistema anterior ("Ã§Ã£o" → "ção"), em qualquer formato.
  const repaired = fixUtf8AsWindows1252(result.markdown);
  const warnings = [...result.warnings];
  if (repaired.fixed >= 2) {
    warnings.push(
      `O texto tinha ${repaired.fixed} acentos corrompidos (ex.: “Ã§” no lugar de “ç”), que foram corrigidos automaticamente.`,
    );
  }
  return {
    ...result,
    markdown: normalizeMarkdown(repaired.fixed >= 2 ? repaired.text : result.markdown),
    // Toda mensagem chega ao usuário em português, agrupada e sem repetições.
    warnings: summarizeWarnings(warnings),
  };
}

export function assetDirFor(fileName: string): string {
  return `${slugify(getBaseName(fileName))}_assets`;
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "arquivo"
  );
}
