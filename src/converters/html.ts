import type { Converter } from "./types";
import { htmlToMarkdown } from "@/lib/html-to-markdown";

export const htmlConverter: Converter = {
  id: "html",
  label: "HTML",
  extensions: [".html", ".htm", ".xhtml"],
  mimeTypes: ["text/html", "application/xhtml+xml"],
  async convert(file) {
    const html = await file.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.title.trim();
    let markdown = htmlToMarkdown(doc.body?.innerHTML ?? html);
    if (title && !/^#\s/m.test(markdown)) markdown = `# ${title}\n\n${markdown}`;
    return { markdown, assets: [], warnings: [] };
  },
};
