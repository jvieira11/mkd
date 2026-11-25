/** Seleção de páginas de um PDF: "Todas", "Primeiras N" ou um intervalo digitado. */

/** Faixa de páginas; `end: null` significa "até a última página". */
export interface PageRange {
  start: number;
  end: number | null;
}

/**
 * Interpreta o que o usuário digitou: "3-7", "3 a 7", "1-3, 5; 10-12", "8-" (até o fim).
 * Devolve as faixas ou uma mensagem de erro em português.
 */
export function parsePageRanges(input: string): { ranges: PageRange[]; error: string | null } {
  const text = input.trim();
  if (!text) return { ranges: [], error: "Digite as páginas, por exemplo 3-7." };

  const ranges: PageRange[] = [];
  const parts = text
    .split(/[,;]+|\s+e\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^(\d+)\s*(?:(?:-|–|—|a|até|ate)\s*(\d+)?)?$/i);
    if (!match) {
      return {
        ranges: [],
        error: `Não entendi “${part}”. Use números e faixas, como 3-7 ou 1-3, 5.`,
      };
    }
    const start = Number(match[1]);
    const hasDash = /\d\s*(-|–|—|a|até|ate)/i.test(part);
    const end = match[2] !== undefined ? Number(match[2]) : hasDash ? null : start;
    if (start < 1 || (end !== null && end < 1)) {
      return { ranges: [], error: "As páginas começam em 1." };
    }
    if (end !== null && end < start) {
      return { ranges: [], error: `Na faixa “${part}”, a página final é menor que a inicial.` };
    }
    ranges.push({ start, end });
  }
  return { ranges, error: null };
}

/** Lista as páginas (em ordem, sem repetição) que existem no documento. */
export function expandPageRanges(ranges: PageRange[], numPages: number): number[] {
  const pages = new Set<number>();
  for (const { start, end } of ranges) {
    const last = Math.min(end ?? numPages, numPages);
    for (let n = start; n <= last; n++) pages.add(n);
  }
  return [...pages].sort((a, b) => a - b);
}

/** Descreve uma lista de páginas de forma compacta: [1,2,3,5] → "1–3, 5". */
export function describePages(pages: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < pages.length;) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j]! + 1) j++;
    parts.push(i === j ? `${pages[i]}` : `${pages[i]}–${pages[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/**
 * Decide quais páginas converter a partir das opções.
 * `mode`: "all", um número (primeiras N) ou "custom" (usa `rangeText`).
 */
export function selectPages(
  mode: string,
  rangeText: string,
  numPages: number,
): { pages: number[]; notice: string | null } {
  const all = Array.from({ length: numPages }, (_, i) => i + 1);
  if (mode === "custom") {
    const { ranges, error } = parsePageRanges(rangeText);
    if (error) throw new Error(`Intervalo de páginas inválido: ${error}`);
    const pages = expandPageRanges(ranges, numPages);
    if (!pages.length) {
      throw new Error(
        `Este PDF tem ${numPages} ${numPages === 1 ? "página" : "páginas"}; nenhuma das páginas pedidas (${rangeText.trim()}) existe.`,
      );
    }
    const asked = ranges.some((r) => r.start > numPages || (r.end ?? 0) > numPages);
    const notice = `Convertidas as páginas ${describePages(pages)} de ${numPages}.${
      asked ? ` Páginas além da ${numPages} foram ignoradas.` : ""
    }`;
    return { pages, notice };
  }
  const limit = mode === "all" ? Infinity : Number(mode);
  const pages = all.slice(0, Number.isFinite(limit) ? limit : numPages);
  const notice =
    pages.length < numPages
      ? `Convertidas as primeiras ${pages.length} de ${numPages} páginas.`
      : null;
  return { pages, notice };
}
