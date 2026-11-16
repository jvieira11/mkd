import type { Converter, ConversionResult, ConverterOptionValues } from "./types";
import { getBaseName } from "./registry";
import { normalizeMarkdown } from "@/lib/markdown";

/** Executa um conversor e aplica o pós-processamento comum a todos os formatos. */
export async function convertFile(
  converter: Converter,
  file: File,
  options: ConverterOptionValues,
): Promise<ConversionResult> {
  const result = await converter.convert(file, {
    options,
    assetDir: assetDirFor(file.name),
  });
  return { ...result, markdown: normalizeMarkdown(result.markdown) };
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
