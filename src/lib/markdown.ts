/** Limpeza aplicada ao Markdown de qualquer conversor. */
export function normalizeMarkdown(markdown: string): string {
  return (
    markdown
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      // espaços no fim da linha (exceto quebra de linha forçada com 2 espaços)
      .replace(/([^ ]) $/gm, "$1")
      .replace(/[ \t]{3,}$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/** Escapa conteúdo para caber em uma célula de tabela GFM. */
export function escapeTableCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim();
}

/** Monta uma tabela GFM. A primeira linha de `rows` vira cabeçalho se `header` for true. */
export function toMarkdownTable(
  rows: string[][],
  header = true,
  escape: (cell: string) => string = escapeTableCell,
): string {
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width === 0) return "";
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => escape(r[i] ?? ""));
  const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
  const head = header
    ? (rows[0] ?? [])
    : Array.from({ length: width }, (_, i) => `Coluna ${i + 1}`);
  const body = header ? rows.slice(1) : rows;
  return [line(head), `| ${Array(width).fill("---").join(" | ")} |`, ...body.map(line)].join("\n");
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/x-emf": "emf",
    "image/x-wmf": "wmf",
  };
  return map[mime] ?? "bin";
}
