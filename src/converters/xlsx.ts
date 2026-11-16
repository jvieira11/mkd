import type { Converter } from "./types";
import { toMarkdownTable } from "@/lib/markdown";

export const xlsxConverter: Converter = {
  id: "xlsx",
  label: "Excel",
  extensions: [".xlsx", ".xlsm"],
  mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  options: [
    {
      type: "boolean",
      key: "header",
      label: "Primeira linha é cabeçalho",
      default: true,
    },
    {
      type: "select",
      key: "maxRows",
      label: "Limite de linhas por aba",
      default: "all",
      choices: [
        { value: "100", label: "100" },
        { value: "1000", label: "1.000" },
        { value: "10000", label: "10.000" },
        { value: "all", label: "Sem limite" },
      ],
    },
  ],
  async convert(file, { options }) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(file);
    const warnings: string[] = [];
    const limit = options["maxRows"] === "all" ? Infinity : Number(options["maxRows"]);

    const sections = sheets.map(({ sheet, data }) => {
      let rows = trimEmpty(data.map((row) => row.map(formatCell)));
      if (rows.length === 0) return `## ${sheet}\n\n*(aba vazia)*`;
      const dataRows = options["header"] ? rows.length - 1 : rows.length;
      if (dataRows > limit) {
        warnings.push(`Aba "${sheet}": exibindo ${limit} de ${dataRows} linhas.`);
        rows = rows.slice(0, limit + (options["header"] ? 1 : 0));
      }
      return `## ${sheet}\n\n${toMarkdownTable(rows, Boolean(options["header"]))}`;
    });

    // Com uma única aba, o título da aba é dispensável.
    const markdown =
      sections.length === 1 ? sections[0]!.replace(/^## .*\n\n/, "") : sections.join("\n\n");
    return { markdown, assets: [], warnings };
  },
};

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.replace("T", " ").slice(0, 19);
  }
  if (typeof value === "boolean") return value ? "VERDADEIRO" : "FALSO";
  return String(value);
}

/** Remove linhas vazias no fim e colunas vazias à direita. */
export function trimEmpty(rows: string[][]): string[][] {
  const out = rows.map((r) => [...r]);
  while (out.length && out[out.length - 1]!.every((c) => c === "")) out.pop();
  const width = Math.max(0, ...out.map((r) => r.reduce((w, c, i) => (c !== "" ? i + 1 : w), 0)));
  return out.map((r) => r.slice(0, width));
}
