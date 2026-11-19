import type { Converter } from "./types";
import { fence } from "./text";
import { toMarkdownTable } from "@/lib/markdown";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export const jsonConverter: Converter = {
  id: "json",
  label: "JSON",
  extensions: [".json", ".geojson", ".jsonl", ".ndjson"],
  mimeTypes: ["application/json", "application/x-ndjson"],
  options: [
    {
      type: "select",
      key: "mode",
      label: "Formato de saída",
      default: "structured",
      choices: [
        { value: "structured", label: "Estruturado (títulos, listas e tabelas)" },
        { value: "code", label: "Bloco de código JSON" },
      ],
    },
  ],
  async convert(file, { options }) {
    const text = await file.text();
    const warnings: string[] = [];
    let data: Json;
    try {
      data = parseJsonOrLines(text, file instanceof File ? file.name : "");
    } catch (error) {
      warnings.push(
        `${describeJsonError(error, text)} O conteúdo foi mantido como bloco de código.`,
      );
      return { markdown: fence(text, "json"), assets: [], warnings };
    }
    const markdown =
      options["mode"] === "code"
        ? fence(JSON.stringify(data, null, 2), "json")
        : jsonToMarkdown(data);
    return { markdown, assets: [], warnings };
  },
};

function parseJsonOrLines(text: string, name: string): Json {
  if (/\.(jsonl|ndjson)$/i.test(name)) {
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Json);
  }
  return JSON.parse(text) as Json;
}

const isPlainObject = (v: Json): v is { [key: string]: Json } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isScalar = (v: Json) => v === null || typeof v !== "object";

function scalar(v: Json): string {
  if (v === null) return "*null*";
  if (typeof v === "string") return v;
  return String(v);
}

/** Converte JSON em Markdown legível: objetos viram seções, listas de objetos viram tabelas. */
export function jsonToMarkdown(data: Json, depth = 1): string {
  if (isScalar(data)) return scalar(data);

  if (Array.isArray(data)) {
    if (data.length === 0) return "*(lista vazia)*";
    if (data.every(isScalar)) return data.map((v) => `- ${scalar(v)}`).join("\n");
    if (data.every((v) => isPlainObject(v) && Object.values(v).every(isScalar))) {
      const objects = data as { [key: string]: Json }[];
      const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))];
      const rows = objects.map((o) => keys.map((k) => (o[k] !== undefined ? scalar(o[k]) : "")));
      return toMarkdownTable([keys, ...rows]);
    }
    return data
      .map((item, i) => `${heading(depth)} Item ${i + 1}\n\n${jsonToMarkdown(item, depth + 1)}`)
      .join("\n\n");
  }

  const entries = Object.entries(data);
  if (entries.length === 0) return "*(objeto vazio)*";
  const simple = entries.filter(([, v]) => isScalar(v));
  const complex = entries.filter(([, v]) => !isScalar(v));
  const parts: string[] = [];
  if (simple.length) parts.push(simple.map(([k, v]) => `- **${k}:** ${scalar(v)}`).join("\n"));
  for (const [k, v] of complex) {
    parts.push(`${heading(depth)} ${k}\n\n${jsonToMarkdown(v, depth + 1)}`);
  }
  return parts.join("\n\n");
}

const heading = (depth: number) => "#".repeat(Math.min(depth, 6));

/** Explica em português onde está o erro de sintaxe do JSON (linha e coluna). */
function describeJsonError(error: unknown, text: string): string {
  const message = error instanceof Error ? error.message : "";
  const position = Number(message.match(/position (\d+)/i)?.[1]);
  const lineCol = message.match(/line (\d+) column (\d+)/i);
  let where = "";
  if (lineCol) where = ` (linha ${lineCol[1]}, coluna ${lineCol[2]})`;
  else if (Number.isFinite(position)) {
    const before = text.slice(0, position).split("\n");
    where = ` (linha ${before.length}, coluna ${(before[before.length - 1] ?? "").length + 1})`;
  } else if (/end of (JSON|data) input|Unexpected end/i.test(message)) {
    where = " (o arquivo termina antes do esperado: falta fechar chaves, colchetes ou aspas)";
  } else {
    // Chrome recente não informa a posição, só o caractere: "Unexpected token ','".
    const token = message.match(/Unexpected (?:token|character) ['"]?(.)['"]?/i)?.[1];
    if (token) where = `: caractere inesperado “${token}”`;
  }
  return `JSON inválido${where}.`;
}
