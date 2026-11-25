/**
 * Junta acentos que vêm separados da letra no texto extraído de PDFs.
 *
 * PDFs gerados pelo LaTeX e por vários sistemas (inclusive órgãos públicos) desenham
 * o acento como um glifo à parte sobre a letra. O texto extraído vira, por exemplo,
 * "Prestac¸ ˜ao de servi c¸ os" em vez de "Prestação de serviços". Aqui os acentos
 * soltos viram acentos combinantes na letra certa e o resultado é normalizado (NFC).
 */

/** Acentos "soltos" (caracteres de espaçamento) → acento combinante equivalente. */
const SPACING_TO_COMBINING: Record<string, string> = {
  "´": "́", // ´ agudo
  ˊ: "́", // ˊ agudo (modificador)
  "`": "̀", // ` grave
  ˋ: "̀", // ˋ grave (modificador)
  ˆ: "̂", // ˆ circunflexo
  "˜": "̃", // ˜ til
  "¨": "̈", // ¨ trema
  "¸": "̧", // ¸ cedilha
};

const ACCENTS = "´ˊ`ˋˆ˜¨";
/** Letras que recebem acento em português (e espanhol/francês): vogais, n, c. */
const BASES = "aeiouyAEIOUYnNcCıȷ";

const DOTLESS: Record<string, string> = { ı: "i", ȷ: "j" };

const combine = (base: string, accent: string) =>
  (DOTLESS[base] ?? base) + SPACING_TO_COMBINING[accent]!;

// Cedilha depois do "c", com espaços falsos ao redor: "servi c¸ os" → "serviços".
const CEDILLA = /(\p{L}?)\s*([cC])\s*¸\s*(\p{L}?)/gu;
// Acento antes da vogal (padrão LaTeX): "Munic´ıpio", "Macei ´o", "˜ao".
const ACCENT_BEFORE = new RegExp(`(\\p{L}?)\\s*([${ACCENTS}])\\s*([${BASES}])`, "gu");
// Acento depois da vogal (outros geradores): "a˜o", "e´".
const ACCENT_AFTER = new RegExp(`([${BASES}])\\s*([${ACCENTS}])`, "gu");
// Acentos combinantes separados da letra por espaço: "a ̃o".
const LOOSE_COMBINING = /\s+([̀-ͯ])/g;

const ANY_DETACHED = new RegExp(`[\\u00b8${ACCENTS}]|\\s[\\u0300-\\u036f]`, "u");

export function fixDetachedDiacritics(text: string): string {
  if (!ANY_DETACHED.test(text)) return text.normalize("NFC");
  return text
    .replace(CEDILLA, (_, before: string, c: string, after: string) => {
      return `${before}${combine(c, "¸")}${after}`;
    })
    .replace(ACCENT_BEFORE, (_, before: string, accent: string, base: string) => {
      return `${before}${combine(base, accent)}`;
    })
    .replace(ACCENT_AFTER, (_, base: string, accent: string) => combine(base, accent))
    .replace(LOOSE_COMBINING, "$1")
    .normalize("NFC");
}
