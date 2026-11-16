import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ClipboardPaste,
  FileDown,
  Layers,
  Loader2,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { registry } from "@/converters";
import { useConversions } from "@/hooks/use-conversions";
import { DropZone } from "@/components/converter/DropZone";
import { FileList } from "@/components/converter/FileList";
import { OptionsPanel } from "@/components/converter/OptionsPanel";
import { MarkdownPreview } from "@/components/converter/MarkdownPreview";
import { Toaster } from "@/components/ui/sonner";
import { Logo } from "@/components/brand/Logo";
import { useGlobalFileInput } from "@/hooks/use-global-file-input";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ConversionProgress } from "@/converters/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadAll } from "@/lib/download";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "mkd — Arquivos para Markdown" },
      {
        name: "description",
        content:
          "Converta PDF, Word, Google Docs, Excel, JSON e TXT para Markdown direto no navegador.",
      },
      { property: "og:title", content: "mkd — Arquivos para Markdown" },
      {
        property: "og:description",
        content:
          "Converta PDF, Word, Google Docs, Excel, JSON e TXT para Markdown direto no navegador.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { theme, toggle: onToggleTheme } = useTheme();
  const { items, addFiles, updateOptions, remove, clear, retry } = useConversions();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = items.find((i) => i.id === selectedId);
  const done = useMemo(() => items.filter((i) => i.status === "done" && i.result), [items]);

  // Mantém sempre algum arquivo selecionado.
  useEffect(() => {
    if (!selected && items[0]) setSelectedId(items[0].id);
  }, [items, selected]);

  const onFiles = (files: File[]) => {
    const added = addFiles(files);
    if (added[0]) setSelectedId(added[0].id);
  };
  const { dragging } = useGlobalFileInput(onFiles);
  const finished = items.filter((i) => i.status !== "pending" && i.status !== "converting").length;

  const extensions = registry
    .list()
    .map((c) => ({ id: c.id, label: c.label, ext: c.extensions.join(" ") }));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4">
          <a
            href="/"
            className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="mkd, início"
          >
            <Logo />
            <span className="hidden border-l pl-3 text-sm text-muted-foreground sm:inline">
              arquivos para Markdown
            </span>
          </a>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand md:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" /> 100% no navegador
            </span>
            <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="Alternar tema">
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {items.length ? `${finished} de ${items.length} arquivos processados.` : ""}
      </p>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand bg-brand-soft px-12 py-10 text-center">
            <Upload className="h-8 w-8 text-brand" />
            <p className="text-lg font-semibold">Solte para converter</p>
            <p className="text-sm text-muted-foreground">Os arquivos não saem do seu computador.</p>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8">
        {items.length === 0 ? (
          <section className="mx-auto max-w-2xl space-y-8 pt-4 sm:pt-10">
            <div className="space-y-4 text-center">
              <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">
                Qualquer arquivo em <span className="text-brand">Markdown limpo</span>
              </h1>
              <p className="text-balance text-muted-foreground sm:text-lg">
                PDF, Word, Google Docs, planilhas, JSON e texto, convertidos direto no navegador.
                Nada é enviado para servidores.
              </p>
            </div>
            <DropZone accept={registry.acceptAttribute()} onFiles={onFiles} />
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <ClipboardPaste className="h-4 w-4 shrink-0" />
              <span>
                Ou cole com <Kbd>Ctrl</Kbd> + <Kbd>V</Kbd> um trecho copiado do Google Docs, Word ou
                de uma página web.
              </span>
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {extensions.map((e) => (
                <Badge key={e.id} variant="outline" className="font-normal" title={e.ext}>
                  {e.label}
                </Badge>
              ))}
            </div>
            <div className="grid gap-3 pt-2 sm:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-lg border bg-card p-4">
                  <Icon className="h-5 w-5 text-brand" />
                  <p className="mt-2 text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Documento inteiro do Google Docs: <em>Arquivo → Fazer download → .docx</em> ou{" "}
              <em>.odt</em>.
            </p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle>Arquivos ({items.length})</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clear}
                    className="h-8 text-muted-foreground"
                  >
                    <Trash2 /> Limpar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <FileList
                    items={items}
                    selectedId={selected?.id}
                    onSelect={setSelectedId}
                    onRemove={remove}
                  />
                  <DropZone compact accept={registry.acceptAttribute()} onFiles={onFiles} />
                  {done.length > 1 && (
                    <Button
                      className="w-full"
                      variant="secondary"
                      onClick={() =>
                        void downloadAll(
                          done.map((i) => ({ fileName: i.file.name, result: i.result! })),
                        )
                      }
                    >
                      <FileDown /> Baixar todos ({done.length}) em .zip
                    </Button>
                  )}
                </CardContent>
              </Card>

              {selected?.converter && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle>Opções · {selected.converter.label}</CardTitle>
                    <CardDescription>Alterar uma opção converte o arquivo de novo.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <OptionsPanel
                      converter={selected.converter}
                      values={selected.options}
                      disabled={selected.status === "converting"}
                      onChange={(values) => updateOptions(selected, values)}
                    />
                  </CardContent>
                </Card>
              )}
            </aside>

            <section className="min-w-0">
              <Card className="flex min-h-[60vh] flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="truncate">
                    {selected?.file.name ?? "Nenhum arquivo selecionado"}
                  </CardTitle>
                  {selected?.durationMs !== undefined && selected.status === "done" && (
                    <CardDescription>
                      Convertido em {(selected.durationMs / 1000).toFixed(2)} s
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col">
                  {selected?.status === "done" && selected.result ? (
                    <MarkdownPreview
                      key={selected.id}
                      fileName={selected.file.name}
                      result={selected.result}
                    />
                  ) : selected?.status === "error" || selected?.status === "unsupported" ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                      <p className="font-medium text-destructive">
                        Não foi possível converter este arquivo.
                      </p>
                      <p className="max-w-md text-sm text-muted-foreground">{selected.error}</p>
                      {selected.status === "error" && (
                        <Button variant="outline" size="sm" onClick={() => void retry(selected)}>
                          <RotateCcw /> Tentar novamente
                        </Button>
                      )}
                    </div>
                  ) : (
                    <ConvertingState progress={selected?.progress} />
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-brand" /> Conversão local: seus arquivos nunca
            saem do navegador.
          </span>
          <span>mkd · arquivos para Markdown</span>
        </div>
      </footer>
      <Toaster theme={theme} />
    </div>
  );
}

function ConvertingState({ progress }: { progress: ConversionProgress | undefined }) {
  const percent = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {progress
          ? `Lendo ${progress.unit} ${progress.done} de ${progress.total}…`
          : "Convertendo…"}
      </div>
      {percent !== null && <Progress value={percent} className="h-1.5 w-64 max-w-full" />}
    </div>
  );
}

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Privado",
    text: "A conversão roda no seu navegador. Nenhum arquivo é enviado.",
  },
  {
    icon: Zap,
    title: "Rápido",
    text: "Títulos, listas, tabelas e imagens preservados em segundos.",
  },
  {
    icon: Layers,
    title: "Em lote",
    text: "Vários arquivos de uma vez, com download de tudo em .zip.",
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  );
}
