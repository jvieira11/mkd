import type { ConversionAsset, Converter } from "./types";
import { htmlToMarkdown } from "@/lib/html-to-markdown";
import { base64ToBytes, extensionForMime } from "@/lib/markdown";

export const docxConverter: Converter = {
  id: "docx",
  label: "Word",
  extensions: [".docx", ".docm", ".dotx"],
  mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
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
    const { default: mammoth } = await import("mammoth");
    const assets: ConversionAsset[] = [];

    const convertImage = mammoth.images.imgElement(async (image) => {
      if (!options["images"]) return { src: "" };
      const ext = extensionForMime(image.contentType);
      const name = `image-${assets.length + 1}.${ext}`;
      assets.push({
        name,
        data: base64ToBytes(await image.readAsBase64String()),
        mimeType: image.contentType,
      });
      return { src: `${assetDir}/${name}` };
    });

    const result = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      { convertImage, ignoreEmptyParagraphs: true },
    );

    // Imagens descartadas ficam com src vazio; remova-as antes do Turndown.
    const html = result.value.replace(/<img[^>]*src=""[^>]*>/g, "");
    const warnings = result.messages.map((m) => m.message);
    return { markdown: htmlToMarkdown(html), assets, warnings };
  },
};
