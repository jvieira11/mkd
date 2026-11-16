/**
 * Mede quanto da página um PDF cobre com imagens, a partir da lista de operações
 * de desenho do pdf.js. Usado para reconhecer páginas escaneadas que também têm um
 * pouco de texto real por cima (carimbos, "baixado em", números de página).
 */

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export interface DrawOps {
  save: number;
  restore: number;
  transform: number;
  formBegin: number;
  formEnd: number;
  images: number[];
}

/**
 * Fração (0–1) da área da página coberta pela maior imagem desenhada.
 * Cada imagem é desenhada no quadrado unitário transformado pela matriz atual,
 * então sua área é o determinante da matriz.
 */
export function largestImageCoverage(
  fnArray: number[],
  argsArray: unknown[][],
  ops: DrawOps,
  pageArea: number,
): number {
  if (pageArea <= 0) return 0;
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  let largest = 0;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] ?? [];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === ops.transform) ctm = multiply(ctm, args as Matrix);
    else if (fn === ops.formBegin) {
      stack.push(ctm);
      const matrix = args[0];
      if (Array.isArray(matrix) && matrix.length === 6) ctm = multiply(ctm, matrix as Matrix);
    } else if (fn === ops.formEnd) ctm = stack.pop() ?? IDENTITY;
    else if (fn !== undefined && ops.images.includes(fn)) {
      const area = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]);
      largest = Math.max(largest, area / pageArea);
    }
  }
  return Math.min(1, largest);
}
