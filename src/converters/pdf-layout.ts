/**
 * Reconstrução de estrutura a partir do texto posicionado de um PDF.
 * Separado do pdf.js para poder ser testado sem um PDF real.
 */

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  /** Altura da fonte em unidades da página. */
  height: number;
}

export interface PdfLayoutOptions {
  pageBreak: "none" | "rule" | "comment";
}

interface Line {
  text: string;
  y: number;
  size: number;
  x: number;
  /** Posição horizontal onde a linha termina. */
  right: number;
}

const BULLET = /^[•●▪◦‣∙·○■□➢►–—*-]\s+/;
const NUMBERED = /^(\d{1,3}|[a-z])[.)]\s+/i;

export function pdfPagesToMarkdown(pages: PdfTextItem[][], options: PdfLayoutOptions): string {
  const pageLines = pages.map(groupLines);
  const bodySize = dominantSize(pageLines.flat());
  const out: string[] = [];

  pageLines.forEach((lines, pageIndex) => {
    if (pageIndex > 0) {
      if (options.pageBreak === "rule") out.push("---");
      if (options.pageBreak === "comment") out.push(`<!-- página ${pageIndex + 1} -->`);
    }
    out.push(...linesToBlocks(lines, bodySize));
  });

  return out.join("\n\n");
}

/** Agrupa itens na mesma linha (y parecido) e ordena de cima para baixo, esquerda para direita. */
export function groupLines(items: PdfTextItem[]): Line[] {
  const sorted = items.filter((i) => i.str.length > 0).sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: PdfTextItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, item.height * 0.4);
    if (row?.[0] && Math.abs(row[0].y - item.y) <= tolerance) row.push(item);
    else rows.push([item]);
  }

  return rows
    .map(([head, ...rest]) => {
      const row = [head!, ...rest].sort((a, b) => a.x - b.x);
      const first = row[0]!;
      let text = "";
      let prevEnd: number | null = null;
      for (const item of row) {
        if (prevEnd !== null) {
          const gap = item.x - prevEnd;
          const needsSpace = gap > item.height * 0.15 && !/\s$/.test(text) && !/^\s/.test(item.str);
          if (needsSpace) text += " ";
        }
        text += item.str;
        prevEnd = item.x + item.width;
      }
      return {
        text: text.replace(/\s+/g, " ").trim(),
        y: first.y,
        x: first.x,
        right: prevEnd ?? first.x,
        size: Math.max(...row.map((i) => i.height)),
      };
    })
    .filter((l) => l.text.length > 0);
}

/** Tamanho de fonte mais usado (ponderado pela quantidade de caracteres). */
function dominantSize(lines: Line[]): number {
  const weights = new Map<number, number>();
  for (const l of lines) {
    const key = Math.round(l.size * 2) / 2;
    weights.set(key, (weights.get(key) ?? 0) + l.text.length);
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, w] of weights) {
    if (w > bestWeight) [best, bestWeight] = [size, w];
  }
  return best || 12;
}

function headingLevel(line: Line, bodySize: number): number {
  if (line.text.length > 120 || /[.,;:]$/.test(line.text)) return 0;
  const ratio = line.size / bodySize;
  if (ratio >= 1.6) return 1;
  if (ratio >= 1.3) return 2;
  if (ratio >= 1.12) return 3;
  return 0;
}

function linesToBlocks(lines: Line[], bodySize: number): string[] {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  // Linhas que terminam bem antes da margem direita encerram o parágrafo
  // (ex.: itens de lista curtos cujo marcador é desenhado como imagem).
  const left = Math.min(...lines.map((l) => l.x));
  const textWidth = Math.max(...lines.map((l) => l.right)) - left;
  const endsEarly = (l: Line) =>
    textWidth > 0 && l.right - left < textWidth * 0.7 && !/-$/.test(l.text);
  let prev: Line | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push(joinParagraph(paragraph));
    paragraph = [];
  };

  for (const line of lines) {
    const level = headingLevel(line, bodySize);
    if (level) {
      flush();
      // Títulos quebrados em duas linhas com o mesmo tamanho viram um só.
      const last = blocks[blocks.length - 1];
      const prefix = "#".repeat(level) + " ";
      if (
        prev &&
        headingLevel(prev, bodySize) === level &&
        last?.startsWith(prefix) &&
        prev.y - line.y < line.size * 1.8
      ) {
        blocks[blocks.length - 1] = `${last} ${line.text}`;
      } else {
        blocks.push(prefix + line.text);
      }
      prev = line;
      continue;
    }

    const isBullet = BULLET.test(line.text);
    const isNumbered = NUMBERED.test(line.text);
    const gap = prev ? prev.y - line.y : 0;
    const newBlock =
      !prev ||
      headingLevel(prev, bodySize) > 0 ||
      gap > Math.max(line.size, bodySize) * 1.6 ||
      endsEarly(prev) ||
      isBullet ||
      isNumbered;

    if (newBlock) flush();

    const text = isBullet ? line.text.replace(BULLET, "- ") : line.text;
    paragraph.push(text);
    prev = line;
  }
  flush();
  return mergeLists(blocks);
}

function joinParagraph(lines: string[]): string {
  let out = lines[0] ?? "";
  for (const next of lines.slice(1)) {
    // Desfaz hifenização no fim da linha: "conver-" + "são" → "conversão"
    if (/[A-Za-zÀ-ÿ]-$/.test(out) && /^[a-zà-ÿ]/.test(next)) out = out.slice(0, -1) + next;
    else out += " " + next;
  }
  return escapeMarkdown(out);
}

/** Escapa caracteres que mudariam o significado no início da linha. */
function escapeMarkdown(text: string): string {
  if (/^- /.test(text) || NUMBERED.test(text)) return text;
  return text.replace(/^([#>+])/, "\\$1");
}

const LIST_LINE = /^(- |\d{1,3}[.)] |[a-z][.)] )/i;

/** Junta blocos de lista adjacentes em um único bloco (sem linhas em branco entre itens). */
function mergeLists(blocks: string[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && LIST_LINE.test(b) && LIST_LINE.test(last.split("\n").pop() ?? "")) {
      out[out.length - 1] = `${last}\n${b}`;
    } else {
      out.push(b);
    }
  }
  return out;
}
