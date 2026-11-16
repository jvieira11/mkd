import { useEffect, useMemo, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import type { ConversionResult } from "@/converters/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assetDirFor } from "@/converters/convert";
import { downloadOne } from "@/lib/download";

interface MarkdownPreviewProps {
  fileName: string;
  result: ConversionResult;
}

export function MarkdownPreview({ fileName, result }: MarkdownPreviewProps) {
  const [copied, setCopied] = useState(false);
  const assetUrls = useAssetUrls(fileName, result);
  const stats = useMemo(() => {
    const words = result.markdown.split(/\s+/).filter(Boolean).length;
    return `${result.markdown.split("\n").length} linhas · ${words.toLocaleString("pt-BR")} palavras`;
  }, [result.markdown]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  return (
    <Tabs defaultValue="code" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="code">Markdown</TabsTrigger>
          <TabsTrigger value="preview">Visualizar</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground md:inline">{stats}</span>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button size="sm" onClick={() => void downloadOne({ fileName, result })}>
            <Download />
            {result.assets.length ? "Baixar .zip" : "Baixar .md"}
          </Button>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <details className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
            {result.warnings.length} aviso(s) da conversão
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {result.warnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <TabsContent value="code" className="min-h-0 flex-1">
        <pre className="h-full max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed">
          {result.markdown}
        </pre>
      </TabsContent>
      <TabsContent value="preview" className="min-h-0 flex-1">
        <article className="prose prose-sm prose-zinc max-h-[70vh] max-w-none overflow-auto rounded-md border p-5 dark:prose-invert prose-table:text-xs prose-img:rounded-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => assetUrls.get(url) ?? defaultUrlTransform(url)}
          >
            {result.markdown}
          </ReactMarkdown>
        </article>
      </TabsContent>
    </Tabs>
  );
}

/** Cria URLs temporárias para que as imagens extraídas apareçam na visualização. */
function useAssetUrls(fileName: string, result: ConversionResult): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());

  // Criadas e revogadas no mesmo efeito: seguro mesmo quando o React remonta o componente.
  useEffect(() => {
    const dir = assetDirFor(fileName);
    const created = new Map(
      result.assets.map((a) => [
        `${dir}/${a.name}`,
        URL.createObjectURL(new Blob([a.data as Uint8Array<ArrayBuffer>], { type: a.mimeType })),
      ]),
    );
    setUrls(created);
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, [fileName, result]);

  return urls;
}
