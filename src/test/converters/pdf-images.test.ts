import { describe, expect, it } from "vitest";
import { largestImageCoverage, type DrawOps } from "@/converters/pdf-images";

const OPS: DrawOps = { save: 1, restore: 2, transform: 3, formBegin: 4, formEnd: 5, images: [9] };
const PAGE = 595 * 842; // A4 em pontos

describe("largestImageCoverage", () => {
  it("detecta uma digitalização ocupando a página inteira", () => {
    const fn = [1, 3, 9, 2];
    const args = [[], [595, 0, 0, 842, 0, 0], [], []];
    expect(largestImageCoverage(fn, args, OPS, PAGE)).toBeCloseTo(1);
  });

  it("um logotipo pequeno não conta como página escaneada", () => {
    const fn = [1, 3, 9, 2];
    const args = [[], [100, 0, 0, 50, 400, 700], [], []];
    expect(largestImageCoverage(fn, args, OPS, PAGE)).toBeLessThan(0.02);
  });

  it("respeita save/restore e transformações aninhadas (formulários)", () => {
    const fn = [1, 3, 2, 4, 3, 9, 5, 9];
    const args = [
      [],
      [10, 0, 0, 10, 0, 0],
      [],
      [[2, 0, 0, 2, 0, 0]],
      [297.5, 0, 0, 421, 0, 0],
      [],
      [],
      [],
    ];
    // Dentro do formulário: escala 2 × (297,5 × 421) = página inteira. Fora: identidade.
    expect(largestImageCoverage(fn, args, OPS, PAGE)).toBeCloseTo(1);
  });
});
