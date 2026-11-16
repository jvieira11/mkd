import type {
  Converter,
  ConversionProgress,
  ConversionResult,
  ConverterOptionValues,
} from "./types";
import { getBaseName } from "./registry";
import { normalizeMarkdown } from "@/lib/markdown";

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
