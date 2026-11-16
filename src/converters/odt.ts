import type { ConversionAsset, Converter } from "./types";
import { toMarkdownTable } from "@/lib/markdown";

/**
 * OpenDocument Text (.odt): formato aberto exportado por Google Docs,
 * LibreOffice e Word. O conteúdo fica em `content.xml` dentro de um ZIP.
 */
export const odtConverter: Converter = {
  id: "odt",
  label: "OpenDocument",
  extensions: [".odt", ".ott"],
  mimeTypes: ["application/vnd.oasis.opendocument.text"],
  options: [
    {
      type: "boolean",
      key: "images",
      label: "Extrair imagens",
      description: "Salva as imagens em uma pasta e referencia no Markdown.",
      default: true,
    },
  ],
  async convert(file, { options, assetDir }) {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const contentXml = await zip.file("content.xml")?.async("string");
    if (!contentXml) throw new Error("Arquivo ODT inválido: content.xml não encontrado.");

    const doc = new DOMParser().parseFromString(contentXml, "application/xml");
    const body = first(doc.documentElement, "office:body");
    const text = body && first(body, "office:text");
    if (!text) throw new Error("Arquivo ODT sem corpo de texto.");

    const assets: ConversionAsset[] = [];
    const pending: Promise<void>[] = [];
    const ctx: OdtContext = {
      styles: readStyles(doc),
      image(href) {
        if (!options["images"]) return null;
        const entry = zip.file(href);
        if (!entry) return null;
        const ext = (href.split(".").pop() ?? "bin").toLowerCase();
        const name = `image-${assets.length + 1}.${ext}`;
        const asset: ConversionAsset = { name, data: new Uint8Array(), mimeType: mimeFor(ext) };
        assets.push(asset);
        pending.push(entry.async("uint8array").then((d) => void (asset.data = d)));
        return `${assetDir}/${name}`;
      },
    };

    const markdown = blocks(text, ctx, 0).join("\n\n");
    await Promise.all(pending);
    return { markdown, assets, warnings: [] };
  },
};

interface OdtContext {
  styles: Map<string, { bold?: boolean; italic?: boolean; strike?: boolean; ordered?: boolean }>;
  image(href: string): string | null;
}

const children = (el: Element) => Array.from(el.children);
const first = (el: Element, name: string) => children(el).find((c) => c.nodeName === name);

function readStyles(doc: Document): OdtContext["styles"] {
  const styles: OdtContext["styles"] = new Map();
  const auto = first(doc.documentElement, "office:automatic-styles");
  if (!auto) return styles;
  for (const s of children(auto)) {
    const name = s.getAttribute("style:name");
    if (!name) continue;
    if (s.nodeName === "style:style") {
      const props = first(s, "style:text-properties");
      if (!props) continue;
      styles.set(name, {
        bold: props.getAttribute("fo:font-weight") === "bold",
        italic: props.getAttribute("fo:font-style") === "italic",
        strike: (props.getAttribute("style:text-line-through-style") ?? "none") !== "none",
      });
    } else if (s.nodeName === "text:list-style") {
      const level = children(s)[0];
      styles.set(name, { ordered: level?.nodeName === "text:list-level-style-number" });
    }
  }
  return styles;
}

function blocks(parent: Element, ctx: OdtContext, listDepth: number): string[] {
  return blockList(children(parent), ctx, listDepth);
}

function blockList(elements: Element[], ctx: OdtContext, listDepth: number): string[] {
  const out: string[] = [];
  for (const el of elements) {
    switch (el.nodeName) {
      case "text:h": {
        const level = Math.min(6, Number(el.getAttribute("text:outline-level") ?? 1));
        const content = inline(el, ctx).trim();
        if (content) out.push(`${"#".repeat(level)} ${content}`);
        break;
      }
      case "text:p": {
        const content = inline(el, ctx).trim();
        if (content) out.push(content);
        break;
      }
      case "text:list":
        out.push(list(el, ctx, listDepth));
        break;
      case "table:table":
        out.push(table(el, ctx));
        break;
      case "text:section":
        out.push(...blocks(el, ctx, listDepth));
        break;
    }
  }
  return out.filter(Boolean);
}

function list(el: Element, ctx: OdtContext, depth: number, inheritedStyle?: string): string {
  const styleName = el.getAttribute("text:style-name") ?? inheritedStyle;
  const ordered = styleName ? ctx.styles.get(styleName)?.ordered : false;
  const indent = "   ".repeat(depth);
  const lines: string[] = [];
  let n = 1;
  for (const item of children(el).filter((c) => c.nodeName === "text:list-item")) {
    const marker = ordered ? `${n++}.` : "-";
    let firstLine = true;
    for (const child of children(item)) {
      if (child.nodeName === "text:list") {
        lines.push(list(child, ctx, depth + 1, styleName));
      } else {
        const content = blockList([child], ctx, depth).join(" ");
        if (!content) continue;
        lines.push(firstLine ? `${indent}${marker} ${content}` : `${indent}   ${content}`);
        firstLine = false;
      }
    }
  }
  return lines.join("\n");
}

function table(el: Element, ctx: OdtContext): string {
  const rows: string[][] = [];
  const collectRows = (parent: Element) => {
    for (const child of children(parent)) {
      if (child.nodeName === "table:table-row") {
        rows.push(
          children(child)
            .filter((c) => c.nodeName === "table:table-cell")
            .map((cell) => blocks(cell, ctx, 0).join(" ")),
        );
      } else if (
        child.nodeName === "table:table-header-rows" ||
        child.nodeName === "table:table-rows"
      ) {
        collectRows(child);
      }
    }
  };
  collectRows(el);
  return toMarkdownTable(rows);
}

function inline(el: Element, ctx: OdtContext): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      out += escapeInline(node.textContent ?? "");
      continue;
    }
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    switch (child.nodeName) {
      case "text:s":
        out += " ".repeat(Number(child.getAttribute("text:c") ?? 1));
        break;
      case "text:tab":
        out += " ";
        break;
      case "text:line-break":
        out += "  \n";
        break;
      case "text:a": {
        const href = child.getAttribute("xlink:href") ?? "";
        const label = inline(child, ctx);
        out += href ? `[${label}](${href})` : label;
        break;
      }
      case "text:span": {
        const content = inline(child, ctx);
        const style = ctx.styles.get(child.getAttribute("text:style-name") ?? "");
        out += style ? wrap(content, style) : content;
        break;
      }
      case "draw:frame": {
        const img = first(child, "draw:image");
        const href = img?.getAttribute("xlink:href");
        const src = href ? ctx.image(href) : null;
        if (src) out += `![${child.getAttribute("draw:name") ?? ""}](${src})`;
        break;
      }
      case "text:note":
      case "office:annotation":
        break;
      default:
        out += inline(child, ctx);
    }
  }
  return out;
}

function wrap(
  content: string,
  style: { bold?: boolean; italic?: boolean; strike?: boolean },
): string {
  const match = content.match(/^(\s*)(.*?)(\s*)$/s);
  if (!match || !match[2]) return content;
  let core = match[2];
  if (style.strike) core = `~~${core}~~`;
  if (style.italic) core = `*${core}*`;
  if (style.bold) core = `**${core}**`;
  return `${match[1]}${core}${match[3]}`;
}

function escapeInline(text: string): string {
  return text.replace(/([\\`*_[\]])/g, "\\$1");
}

function mimeFor(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}
