/**
 * Mensagens para o usuário em português.
 *
 * As bibliotecas de conversão (mammoth, JSZip, pdf.js, read-excel-file, Tesseract)
 * geram avisos e erros técnicos em inglês. Aqui eles viram frases curtas em pt-BR,
 * que dizem o que aconteceu e se o resultado foi afetado.
 */

type Rule = [RegExp, string | ((m: RegExpMatchArray) => string)];

const STYLE_TYPES: Record<string, string> = {
  paragraph: "parágrafo",
  run: "texto",
  table: "tabela",
  character: "texto",
};

const WARNING_RULES: Rule[] = [
  [
    /^An unrecognised element was ignored: (.+)$/i,
    (m) => `Um elemento do documento não é suportado e foi ignorado (${m[1]}).`,
  ],
  [
    /^Image of type (.+) is unlikely to display in web browsers$/i,
    (m) =>
      `Uma imagem está em um formato que os navegadores não exibem (${m[1]}). Ela foi extraída, mas pode não aparecer na prévia.`,
  ],
  [
    /^Could not find image file for a:blip element$/i,
    "Uma imagem referenciada no documento não foi encontrada no arquivo e ficou de fora.",
  ],
  [
    /^A v:imagedata element without a relationship ID was ignored$/i,
    "Uma imagem antiga (formato VML) sem referência válida foi ignorada.",
  ],
  [
    /^Unsupported break type: (.+)$/i,
    (m) => `Um tipo de quebra não suportado foi ignorado (${m[1]}).`,
  ],
  [
    /^Ignoring complex field (end|separator) character without corresponding start character$/i,
    "Um campo do Word (ex.: sumário, data automática) estava malformado; o texto visível foi mantido.",
  ],
  [
    /^A w:sym element with an unsupported character was ignored: char (\S+) in font (.+)$/i,
    (m) => `Um símbolo especial da fonte ${m[2]} não pôde ser convertido e foi omitido.`,
  ],
  [
    /^unexpected non-(row|cell) element in table.*$/i,
    "Uma tabela tem estrutura incomum; células mescladas podem não ter saído corretamente.",
  ],
  [
    /^Did not understand this style mapping, so ignored it: (.+)$/i,
    "Uma regra de estilo embutida no documento não foi entendida e foi ignorada.",
  ],
];

const ERROR_RULES: Rule[] = [
  [
    /is this a zip file|end of central directory|Corrupted zip|End of data reached|Bug or corrupted zip/i,
    "O arquivo não pôde ser aberto: ele pode estar protegido por senha, corrompido, ou ser de um formato antigo (como .doc ou .xls). Abra-o no Word/Excel e salve como .docx/.xlsx.",
  ],
  [
    /Encrypted zip are not supported/i,
    "O arquivo está protegido por senha. Remova a senha e tente de novo.",
  ],
  [
    /Could not find main document part|Could not find the body element/i,
    "Este arquivo não parece ser um documento do Word (.docx) válido.",
  ],
  [
    /No password given|Incorrect Password|PasswordException/i,
    "Este PDF é protegido por senha. Remova a senha e tente de novo.",
  ],
  [/Invalid PDF structure|InvalidPDFException/i, "O PDF parece estar corrompido ou incompleto."],
  [
    /Sheet relation ID not found|Unknown closing tag|<c r=/i,
    "A planilha parece estar corrompida ou foi gerada de um jeito incomum.",
  ],
  [
    /source image could not be decoded|could not be decoded|InvalidStateError/i,
    "Não foi possível abrir a imagem. O formato pode não ser suportado por este navegador.",
  ],
  [
    /Failed to fetch|NetworkError|Load failed|Failed to load|Importing a module script failed|dynamically imported module/i,
    "Não foi possível carregar uma parte do conversor. Verifique a conexão com a internet e tente de novo.",
  ],
  [
    /out of memory|Array buffer allocation failed|Invalid array length|Maximum call stack/i,
    "O arquivo é grande demais para a memória disponível no navegador. Tente converter menos páginas ou um arquivo menor.",
  ],
];

function applyRules(message: string, rules: Rule[]): string | null {
  const text = message.trim();
  for (const [pattern, output] of rules) {
    const match = text.match(pattern);
    if (match) return typeof output === "string" ? output : output(match);
  }
  return null;
}

/** Já está em português (mensagens do próprio mkd)? */
function looksPortuguese(text: string): boolean {
  return /[ãõçáéíóúâêô]|\b(não|página|arquivo|imagem|texto|aba|linhas?)\b/i.test(text);
}

/** Traduz um aviso de conversão. Mensagens desconhecidas ganham um prefixo explicativo. */
export function translateWarning(message: string): string {
  const translated = applyRules(message, WARNING_RULES);
  if (translated) return translated;
  if (looksPortuguese(message)) return message;
  return `Aviso técnico da conversão: ${message}`;
}

/** Traduz uma mensagem de erro (conversão que falhou). */
export function translateError(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error ?? "Erro desconhecido");
  const translated = applyRules(raw, ERROR_RULES);
  if (translated) return translated;
  const message = error instanceof Error ? error.message : raw;
  if (looksPortuguese(message)) return message;
  return `Não foi possível converter este arquivo. Detalhe técnico: ${message}`;
}

/**
 * Traduz e agrupa avisos. Estilos do Word não reconhecidos costumam vir aos montes
 * (um por estilo) e são inofensivos: viram um único aviso explicativo.
 */
export function summarizeWarnings(messages: string[]): string[] {
  const styles = new Map<string, Set<string>>();
  const undefinedStyles = new Set<string>();
  const others: string[] = [];

  for (const message of messages) {
    const unrecognised = message.match(/^Unrecognised (\w+) style: '(.*)' \(Style ID: (.*)\)$/i);
    if (unrecognised) {
      const type = STYLE_TYPES[unrecognised[1]!.toLowerCase()] ?? unrecognised[1]!.toLowerCase();
      if (!styles.has(type)) styles.set(type, new Set());
      styles.get(type)!.add(unrecognised[2] || unrecognised[3]!);
      continue;
    }
    const undefinedStyle = message.match(
      /^(\w+) style with ID (.+) was referenced but not defined/i,
    );
    if (undefinedStyle) {
      undefinedStyles.add(undefinedStyle[2]!);
      continue;
    }
    others.push(translateWarning(message));
  }

  const out: string[] = [];
  if (styles.size) {
    const list = [...styles.entries()]
      .map(([type, names]) => `${type}: ${[...names].map((n) => `“${n}”`).join(", ")}`)
      .join("; ");
    out.push(
      `O documento usa estilos do Word sem equivalente em Markdown (${list}). O texto foi convertido normalmente; esses trechos ficaram como texto comum.`,
    );
  }
  if (undefinedStyles.size) {
    out.push(
      `O documento cita estilos que não existem nele (${[...undefinedStyles].join(", ")}). O texto foi mantido, sem essa formatação.`,
    );
  }
  return [...new Set([...out, ...others])];
}
