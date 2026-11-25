/**
 * Corrige texto de PDF com acentos trocados por símbolos ("mojibake").
 *
 * Alguns geradores de PDF gravam o texto em Windows-1252, mas declaram a fonte
 * como Mac Roman. O leitor então mostra "√" no lugar de "Ã", "Ì" no lugar de "í",
 * "∫" no lugar de "º"… ("MUNICÕPIO", "dispıe", "p˙blico"). A correção desfaz a
 * leitura errada: volta cada caractere ao byte Mac Roman e lê como Windows-1252.
 *
 * A decisão é por fonte, porque no mesmo PDF podem existir fontes corretas e
 * fontes com o problema.
 */

/** Bytes 0x80–0xFF em Mac Roman (gerado com `bytes(range(128,256)).decode("mac_roman")`). */
const MAC_ROMAN_HIGH =
  "ÄÅÇÉÑÖÜáàâäãåçéè" +
  "êëíìîïñóòôöõúùûü" +
  "†°¢£§•¶ß®©™´¨≠ÆØ" +
  "∞±≤≥¥µ∂∑∏π∫ªºΩæø" +
  "¿¡¬√ƒ≈∆«»… ÀÃÕŒœ" +
  "–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ" +
  "‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ" +
  "ÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ";

let reverseMap: Map<string, string> | null = null;

/** Caractere lido como Mac Roman → caractere correto em Windows-1252. */
function getReverseMap(): Map<string, string> {
  if (reverseMap) return reverseMap;
  const bytes = Uint8Array.from({ length: 128 }, (_, i) => 128 + i);
  const cp1252 = new TextDecoder("windows-1252").decode(bytes);
  reverseMap = new Map();
  for (let i = 0; i < 128; i++) {
    const from = MAC_ROMAN_HIGH[i]!;
    const to = cp1252[i]!;
    if (from !== to) reverseMap.set(from, to);
  }
  return reverseMap;
}

/** Desfaz a leitura Mac Roman de um texto que estava em Windows-1252. */
export function fixMacRoman(text: string): string {
  const map = getReverseMap();
  let out = "";
  for (const ch of text) out += map.get(ch) ?? ch;
  return out;
}

/** Letras e sinais do português que aparecem quando a correção está certa. */
const PORTUGUESE = new Set("áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑºª");
/** Trocas ambíguas: também podem ser aspas/espaços legítimos numa fonte correta. */
const WEAK = new Set(["“", "”", "‘", "’", " "]);
const isLetter = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch);

export interface EncodingEvidence {
  /** Trocas que viram letras do português dentro de palavras (ex.: "Ì" entre letras). */
  strong: number;
  /** Trocas que viram letras, mas a partir de aspas ou espaço (podem ser legítimas). */
  weak: number;
  /** Trocas que viram algo improvável (indica que a fonte já está correta). */
  against: number;
}

/** Mede o quanto um texto parece ter sido lido com a codificação errada. */
export function measureMacRoman(text: string): EncodingEvidence {
  const map = getReverseMap();
  const chars = [...text];
  const evidence: EncodingEvidence = { strong: 0, weak: 0, against: 0 };
  chars.forEach((ch, i) => {
    const fixed = map.get(ch);
    if (!fixed) return;
    const nearLetter = isLetter(chars[i - 1]) || isLetter(chars[i + 1]);
    if (PORTUGUESE.has(fixed) && nearLetter) {
      if (WEAK.has(ch)) evidence.weak++;
      else evidence.strong++;
    } else if (!WEAK.has(ch) && (isLetter(ch) || nearLetter)) {
      // Ex.: "ê" correto viraria um caractere de controle → a fonte está certa.
      evidence.against++;
    }
  });
  return evidence;
}

/**
 * Decide, fonte a fonte, quais textos precisam da correção, acumulando evidências
 * ao longo do documento (uma fonte pode ter só "MACEI”" numa página).
 */
export class MacRomanDetector {
  private evidence = new Map<string, EncodingEvidence>();
  private documentAffected = false;

  /** Corrige os textos de uma página, agrupados pelo nome da fonte. */
  fixPage<T extends { str: string; fontName: string }>(items: T[]): T[] {
    for (const item of items) {
      const sum = this.evidence.get(item.fontName) ?? { strong: 0, weak: 0, against: 0 };
      const e = measureMacRoman(item.str);
      sum.strong += e.strong;
      sum.weak += e.weak;
      sum.against += e.against;
      this.evidence.set(item.fontName, sum);
    }
    for (const e of this.evidence.values()) {
      if (this.isStrong(e)) this.documentAffected = true;
    }
    return items.map((item) =>
      this.shouldFix(item.fontName) ? { ...item, str: fixMacRoman(item.str) } : item,
    );
  }

  /** Alguma fonte do documento foi corrigida? */
  get affected(): boolean {
    return this.documentAffected;
  }

  private isStrong(e: EncodingEvidence): boolean {
    return e.strong >= 2 && e.strong >= e.against * 3;
  }

  private shouldFix(fontName: string): boolean {
    const e = this.evidence.get(fontName);
    if (!e) return false;
    if (this.isStrong(e)) return true;
    // Fontes com pouco texto (ex.: só "MACEI”") são corrigidas quando o documento
    // comprovadamente tem o problema e nada nelas contradiz a correção.
    return this.documentAffected && e.against === 0 && e.strong + e.weak >= 1;
  }
}

/**
 * Em Mac Roman, o código do "Ê" do Windows-1252 é o espaço sem quebra; o leitor de PDF
 * o transforma em espaço comum e a letra some ("DEFICI NCIA"). Só dá para recuperar
 * pelo padrão das palavras, então isto vale apenas para documentos com o problema
 * comprovado e para palavras em maiúsculas (o "ê" minúsculo não é afetado).
 */
const LOST_E_CIRCUMFLEX =
  /(\p{Lu}{2,}|(?<!\p{L})G) (NCIAS?|NCIOS?|NEROS?|NERES|NTIC[AO]S?|MIC[AO]S?|NIX|NIA|NIOS?)(?!\p{L})/gu;

export function restoreUppercaseECircumflex(text: string): string {
  return text.replace(LOST_E_CIRCUMFLEX, "$1Ê$2");
}

/**
 * UTF-8 lido como Windows-1252 ("Ã§Ã£o" no lugar de "ção", "NÂº" no lugar de "Nº").
 * Acontece quando o texto passou por um sistema que errou a codificação antes de
 * virar PDF/DOCX/TXT. Cada par "Ã§" volta a ser os dois bytes UTF-8 originais.
 */
let cp1252Bytes: Map<string, number> | null = null;

function cp1252ByteOf(ch: string): number | undefined {
  if (!cp1252Bytes) {
    cp1252Bytes = new Map();
    const decoded = new TextDecoder("windows-1252").decode(
      Uint8Array.from({ length: 256 }, (_, i) => i),
    );
    [...decoded].forEach((c, i) => cp1252Bytes!.set(c, i));
    // Bytes sem caractere em Windows-1252 aparecem como o próprio código (Latin-1).
    for (const b of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) cp1252Bytes.set(String.fromCharCode(b), b);
  }
  return cp1252Bytes.get(ch);
}

/** Primeiro byte de sequências UTF-8 de 2 bytes que cobrem os acentos latinos (Â, Ã, Å). */
const UTF8_LEAD = /[ÂÃÅ]/;

export function fixUtf8AsWindows1252(text: string): { text: string; fixed: number } {
  if (!UTF8_LEAD.test(text)) return { text, fixed: 0 };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chars = [...text];
  let out = "";
  let fixed = 0;
  for (let i = 0; i < chars.length; i++) {
    const lead = cp1252ByteOf(chars[i]!);
    const cont = chars[i + 1] !== undefined ? cp1252ByteOf(chars[i + 1]!) : undefined;
    if (
      lead !== undefined &&
      lead >= 0xc2 &&
      lead <= 0xc5 &&
      cont !== undefined &&
      cont >= 0x80 &&
      cont <= 0xbf
    ) {
      try {
        out += decoder.decode(Uint8Array.of(lead, cont));
        fixed++;
        i++;
        continue;
      } catch {
        /* não era uma sequência válida: mantém o texto */
      }
    }
    out += chars[i];
  }
  // "à"/"às": o segundo byte é um espaço sem quebra, que costuma virar espaço comum
  // no caminho ("Ã  vista", "Ã s 10h"). Só em textos com o defeito comprovado e com o
  // "Ã" isolado, para não mexer em palavras como "IRMÃ" ou "AMANHÃ".
  if (fixed >= 2) {
    out = out.replace(/(^|[^\p{L}])Ã[ \u00a0]/gu, (_, before: string) => {
      fixed++;
      return `${before}à`;
    });
  }
  return { text: out, fixed };
}
