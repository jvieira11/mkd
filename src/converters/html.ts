import { encodingNotice, readText } from "@/lib/encoding";
import type { Converter } from "./types";
import { htmlToMarkdown } from "@/lib/html-to-markdown";

export const htmlConverter: Converter = {
  id: "html",
  label: "HTML",
  extensions: [".html", ".htm", ".xhtml"],
  mimeTypes: ["text/html", "application/xhtml+xml"],
  async convert(file) {
    const { text: html, encoding } = await readText(file, { html: true });
    const doc = new DOMParser().parseFromString(html, "text/html");
    normalizeInlineStyles(doc);
    const title = doc.title.trim();
    let markdown = htmlToMarkdown(doc.body?.innerHTML ?? html);
    if (title && !/^#\s/m.test(markdown)) markdown = `# ${title}\n\n${markdown}`;
    const notice = encodingNotice(encoding);
    return { markdown, assets: [], warnings: notice ? [notice] : [] };
  },
};

/**
 * Conteúdo copiado do Google Docs (e de alguns editores web) marca negrito, itálico e
 * riscado por CSS em vez de tags, e envolve tudo em um <b style="font-weight:normal">.
 * Aqui isso vira <strong>/<em>/<del> para o Turndown entender.
 */
export function normalizeInlineStyles(doc: Document): void {
  // Wrapper do Google Docs: <b style="font-weight:normal" id="docs-internal-guid-...">
  for (const el of Array.from(doc.querySelectorAll("b, strong"))) {
    const weight = (el as HTMLElement).style.fontWeight;
    if (weight === "normal" || (weight && Number(weight) < 600)) unwrap(el);
  }

  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("span[style]"))) {
    const { fontWeight, fontStyle, textDecoration, textDecorationLine } = el.style;
    const bold = fontWeight === "bold" || Number(fontWeight) >= 600;
    const italic = fontStyle === "italic";
    const strike = `${textDecoration} ${textDecorationLine}`.includes("line-through");
    if (!el.textContent?.trim() || !(bold || italic || strike)) continue;

    let inner: Node = doc.createDocumentFragment();
    while (el.firstChild) inner.appendChild(el.firstChild);
    for (const [on, tag] of [
      [strike, "del"],
      [italic, "em"],
      [bold, "strong"],
    ] as const) {
      if (!on) continue;
      const wrapper = doc.createElement(tag);
      wrapper.appendChild(inner);
      inner = wrapper;
    }
    el.appendChild(inner);
  }
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}
