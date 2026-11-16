import type { Converter, ConverterOptionValues } from "./types";

export class ConverterRegistry {
  private converters: Converter[] = [];

  register(converter: Converter): this {
    if (this.converters.some((c) => c.id === converter.id)) {
      throw new Error(`Já existe um conversor com id "${converter.id}".`);
    }
    this.converters.push(converter);
    return this;
  }

  list(): readonly Converter[] {
    return this.converters;
  }

  get(id: string): Converter | undefined {
    return this.converters.find((c) => c.id === id);
  }

  /** Encontra o conversor pela extensão do nome; se não achar, pelo MIME type. */
  find(fileName: string, mimeType = ""): Converter | undefined {
    const ext = getExtension(fileName);
    if (ext) {
      const byExt = this.converters.find((c) => c.extensions.includes(ext));
      if (byExt) return byExt;
    }
    if (mimeType) {
      return this.converters.find((c) => c.mimeTypes.includes(mimeType));
    }
    return undefined;
  }

  /** Valor do atributo `accept` do <input type="file">. */
  acceptAttribute(): string {
    return this.converters.flatMap((c) => c.extensions).join(",");
  }

  defaultOptions(converter: Converter): ConverterOptionValues {
    return Object.fromEntries((converter.options ?? []).map((o) => [o.key, o.default]));
  }
}

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot).toLowerCase() : "";
}

export function getBaseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
