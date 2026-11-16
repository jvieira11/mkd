import type { ConversionResult } from "@/converters/types";
import { getBaseName } from "@/converters/registry";
import { assetDirFor } from "@/converters/convert";

export interface DownloadableItem {
  fileName: string;
  result: ConversionResult;
}

export function markdownFileName(fileName: string): string {
  return `${getBaseName(fileName)}.md`;
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Baixa um único resultado: `.md` puro, ou `.zip` se houver imagens. */
export async function downloadOne(item: DownloadableItem): Promise<void> {
  if (item.result.assets.length === 0) {
    const blob = new Blob([item.result.markdown], { type: "text/markdown;charset=utf-8" });
    triggerDownload(blob, markdownFileName(item.fileName));
    return;
  }
  const zip = await buildZip([item]);
  triggerDownload(zip, `${getBaseName(item.fileName)}.zip`);
}

export async function downloadAll(items: DownloadableItem[]): Promise<void> {
  triggerDownload(await buildZip(items), "mkd-convertidos.zip");
}

export async function buildZip(items: DownloadableItem[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  for (const { fileName, result } of items) {
    zip.file(uniqueName(markdownFileName(fileName), used), result.markdown);
    const dir = assetDirFor(fileName);
    for (const asset of result.assets) zip.file(`${dir}/${asset.name}`, asset.data);
  }
  return zip.generateAsync({ type: "blob" });
}

function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) candidate = name.replace(/(\.md)$/, ` (${n++})$1`);
  used.add(candidate);
  return candidate;
}
