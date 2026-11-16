/**
 * Reconstrução de estrutura a partir do texto posicionado de um PDF.
 * Separado do pdf.js para poder ser testado sem um PDF real.
 */

import { toMarkdownTable } from "@/lib/markdown";

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
  /** Detecta blocos com colunas alinhadas e gera tabelas Markdown. */
  tables: boolean;
}

/** Trecho contínuo de uma linha, separado do próximo por um espaço grande (possível coluna). */
interface Segment {
  text: string;
  x: number;
  right: number;
}

export interface PdfLine {
  text: string;
  y: number;
  size: number;
  x: number;
  /** Posição horizontal onde a linha termina. */
  right: number;
  segments: Segment[];
}

type Line = PdfLine;

/** Espaço horizontal (em múltiplos da altura da fonte) a partir do qual começa outra coluna. */
const COLUMN_GAP = 0.6;

const BULLET = /^[•●▪◦‣∙·○■□➢►–—*-]\s+/;
const NUMBERED = /^(\d{1,3}|[a-z])[.)]\s+/i;

export function pdfPagesToMarkdown(pages: PdfTextItem[][], options: PdfLayoutOptions): string {
  return pdfLinesToMarkdown(pages.map(groupLines), options);
}

/**
 * Versão que recebe as linhas já agrupadas por página. Usada na conversão real para
 * não manter na memória todos os itens de texto de PDFs muito grandes.
 */
export function pdfLinesToMarkdown(pageLines: PdfLine[][], options: PdfLayoutOptions): string {
  const bodySize = dominantSize(pageLines.flat());
  const out: string[] = [];

  pageLines.forEach((lines, pageIndex) => {
    if (pageIndex > 0) {
      if (options.pageBreak === "rule") out.push("---");
      if (options.pageBreak === "comment") out.push(`<!-- página ${pageIndex + 1} -->`);
    }
    out.push(...linesToBlocks(lines, bodySize, options.tables));
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
      const segments: Segment[] = [];
      let current: Segment | null = null;
      for (const item of row) {
        const end = item.x + item.width;
        if (current && !item.str.trim()) {
          current.text += " ";
          continue;
        }
        if (!current) {
          current = { text: item.str, x: item.x, right: end };
          segments.push(current);
          continue;
        }
        const gap = item.x - current.right;
        if (gap > Math.max(item.height, 4) * COLUMN_GAP) {
          current = { text: item.str, x: item.x, right: end };
          segments.push(current);
        } else {
          const needsSpace =
            gap > item.height * 0.15 && !/\s$/.test(current.text) && !/^\s/.test(item.str);
          current.text += (needsSpace ? " " : "") + item.str;
          current.right = Math.max(current.right, end);
        }
      }
      const cleaned = segments
        .map((seg) => ({ ...seg, text: seg.text.replace(/\s+/g, " ").trim() }))
        .filter((seg) => seg.text.length > 0);
      return {
        text: cleaned.map((seg) => seg.text).join(" "),
        y: first.y,
        x: cleaned[0]?.x ?? first.x,
        right: cleaned[cleaned.length - 1]?.right ?? first.x,
        size: Math.max(...row.map((i) => i.height)),
        segments: cleaned,
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

function linesToBlocks(lines: Line[], bodySize: number, detectTables: boolean): string[] {
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const table = detectTables ? findTable(lines, i) : null;
    if (table) {
      flush();
      blocks.push(toMarkdownTable(table.rows));
      i = table.end - 1;
      prev = null;
      continue;
    }

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

interface TableMatch {
  /** Índice (exclusivo) da primeira linha depois da tabela. */
  end: number;
  rows: string[][];
}

/**
 * Procura uma tabela começando na linha `start`: duas ou mais linhas seguidas,
 * cada uma com dois ou mais segmentos, cujos segmentos se alinham nas mesmas colunas.
 */
export function findTable(lines: Line[], start: number): TableMatch | null {
  const first = lines[start];
  if (!first || first.segments.length < 2) return null;

  const run: Line[] = [first];
  for (let j = start + 1; j < lines.length; j++) {
    const line = lines[j]!;
    const prev = run[run.length - 1]!;
    if (line.segments.length < 2) break;
    if (prev.y - line.y > Math.max(prev.size, line.size) * 2.6) break;
    run.push(line);
  }
  if (run.length < 2) return null;

  // Colunas de referência: a linha com mais segmentos.
  const reference = run.reduce((a, b) => (b.segments.length > a.segments.length ? b : a));
  const columns = reference.segments.map((seg) => ({ x: seg.x, right: seg.right }));
  const tolerance = reference.size * 1.5;

  let misses = 0;
  let total = 0;
  const words: number[] = [];
  const rows = run.map((line) => {
    const cells: string[] = Array.from({ length: columns.length }, () => "");
    for (const seg of line.segments) {
      total++;
      words.push(seg.text.split(" ").length);
      let best = -1;
      let bestOverlap = -Infinity;
      columns.forEach((col, c) => {
        const overlap =
          Math.min(seg.right, col.right + tolerance) - Math.max(seg.x, col.x - tolerance);
        if (overlap > bestOverlap) [best, bestOverlap] = [c, overlap];
      });
      if (bestOverlap <= 0) misses++;
      cells[best] = cells[best] ? `${cells[best]} ${seg.text}` : seg.text;
    }
    return cells;
  });

  // Rejeita quando as colunas não se alinham ou quando os "segmentos" são frases longas
  // (provável página com duas colunas de texto, não uma tabela).
  if (misses > total * 0.2) return null;
  const sortedWords = [...words].sort((a, b) => a - b);
  const median = sortedWords[Math.floor(sortedWords.length / 2)] ?? 0;
  if (median > 6) return null;

  return { end: start + run.length, rows };
}
