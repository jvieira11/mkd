/**
 * Leitura de arquivos de texto com detecção de codificação.
 *
 * `Blob.text()` sempre assume UTF-8, mas muitos arquivos brasileiros (Bloco de Notas
 * antigo, exportações de sistemas, páginas antigas) estão em Windows-1252 ("ANSI"),
 * e aí "ç" e "ã" viram "�". Ordem de decisão:
 *   1. BOM (UTF-8, UTF-16 LE/BE);
 *   2. em HTML, o <meta charset> declarado;
 *   3. UTF-8 válido;
 *   4. Windows-1252 (cobre o Latin-1/ISO-8859-1, comum no Brasil).
 */

export interface DecodedText {
  text: string;
  /** Codificação usada, ex.: "utf-8", "windows-1252". */
  encoding: string;
}

const ENCODING_NAMES: Record<string, string> = {
  "windows-1252": "Windows-1252 (ANSI)",
  "iso-8859-1": "ISO-8859-1 (Latin-1)",
  "iso-8859-15": "ISO-8859-15 (Latin-9)",
  "utf-16le": "UTF-16",
  "utf-16be": "UTF-16",
};

export async function readText(file: Blob, options: { html?: boolean } = {}): Promise<DecodedText> {
  return decodeBytes(new Uint8Array(await file.arrayBuffer()), options);
}

export function decodeBytes(bytes: Uint8Array, options: { html?: boolean } = {}): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "utf-16le" };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes), encoding: "utf-16be" };
  }

  if (options.html) {
    const declared = declaredHtmlCharset(bytes);
    if (declared && declared !== "utf-8") {
      try {
        return { text: new TextDecoder(declared).decode(bytes), encoding: declared };
      } catch {
        /* rótulo desconhecido: segue a detecção normal */
      }
    }
  }

  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

/** Lê o charset de <meta charset="..."> ou <meta http-equiv content="...; charset=..."> . */
function declaredHtmlCharset(bytes: Uint8Array): string | null {
  // O cabeçalho é ASCII em todas as codificações que importam aqui.
  const head = String.fromCharCode(...bytes.subarray(0, 2048));
  const label = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i)?.[1];
  if (!label) return null;
  try {
    return new TextDecoder(label).encoding; // normaliza o nome (ex.: "latin1" → "windows-1252")
  } catch {
    return null;
  }
}

/** Aviso informativo quando o arquivo não estava em UTF-8. */
export function encodingNotice(encoding: string): string | null {
  if (encoding === "utf-8") return null;
  const name = ENCODING_NAMES[encoding] ?? encoding.toUpperCase();
  return `O arquivo estava na codificação ${name}; os acentos foram convertidos corretamente para UTF-8.`;
}
