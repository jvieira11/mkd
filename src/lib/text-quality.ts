/**
 * Detecta texto extraído de PDF que não é legível: fontes sem mapa de caracteres
 * (ToUnicode) produzem letras deslocadas ("3UHIHLWXUD" no lugar de "Prefeitura"),
 * caracteres de controle ou de uso privado. Nesses casos o texto não tem conserto
 * por regras, e a página deve ser lida por OCR.
 */

/** Palavras muito frequentes em português, espanhol, inglês, francês, italiano e alemão. */
const COMMON_WORDS = new Set(
  (
    "de a o que e do da em um uma para com não nao os as no na por mais se dos das ao à às " +
    "como mas foi ser são sao é este esta isso pelo pela sua seu ou já ja quando muito " +
    "nos nas há ha art lei nº sobre entre até ate após apos também tambem " +
    "el la los las del y en un una por con para es al lo " +
    "the of and to in is for on that with as by be are this from or at an it " +
    "le les des et est une du dans pour pas sur au il di che per non sono " +
    "der die und das ist nicht ein zu den mit von"
  ).split(/\s+/),
);

export interface TextQuality {
  /** Fração de caracteres de controle/uso privado/substituição. */
  junkRatio: number;
  /** Fração de palavras que são palavras comuns do idioma. */
  commonWordRatio: number;
  /** Quantidade de palavras avaliadas. */
  words: number;
  garbled: boolean;
}

export function assessTextQuality(text: string): TextQuality {
  const chars = [...text].filter((c) => !/\s/.test(c));
  const junk = chars.filter((c) =>
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f-�]/.test(c),
  ).length;
  const junkRatio = chars.length ? junk / chars.length : 0;

  const words = text
    .toLowerCase()
    .split(/[\s\u0000-\u001f]+/)
    .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}º]+$/gu, ""))
    .filter((w) => /^\p{L}[\p{L}º]*$/u.test(w));
  const common = words.filter((w) => COMMON_WORDS.has(w)).length;
  const commonWordRatio = words.length ? common / words.length : 0;

  const garbled =
    (chars.length >= 20 && junkRatio > 0.05) ||
    // Texto corrido de verdade tem bem mais de 4% de palavras como "de", "a", "que".
    (words.length >= 25 && commonWordRatio < 0.04);

  return { junkRatio, commonWordRatio, words: words.length, garbled };
}
