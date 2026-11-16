import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown, Loader2, Moon, RotateCcw, Sun, Trash2 } from "lucide-react";
import { registry } from "@/converters";
import { useConversions } from "@/hooks/use-conversions";
import { DropZone } from "@/components/converter/DropZone";
import { FileList } from "@/components/converter/FileList";
import { OptionsPanel } from "@/components/converter/OptionsPanel";
import { MarkdownPreview } from "@/components/converter/MarkdownPreview";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const extensions = registry
    .list()
    .map((c) => ({ id: c.id, label: c.label, ext: c.extensions.join(" ") }));

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-[1400px] px-4 items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="font-semibold tracking-tight">mkd</span>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              · arquivos para Markdown
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="Alternar tema">
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-8">
        {items.length === 0 ? (
          <section className="mx-auto max-w-2xl space-y-8 pt-6">
            <div className="space-y-3 text-center">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Converta arquivos para Markdown
              </h1>
              <p className="text-muted-foreground">
                PDF, Word, Google Docs, planilhas, JSON e texto, convertidos direto no navegador.
              </p>
            </div>
            <DropZone accept={registry.acceptAttribute()} onFiles={onFiles} />
            <div className="flex flex-wrap justify-center gap-2">
              {extensions.map((e) => (
                <Badge key={e.id} variant="outline" className="font-normal" title={e.ext}>
                  {e.label}
                </Badge>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Google Docs: use <em>Arquivo → Fazer download → Microsoft Word (.docx)</em> ou{" "}
              <em>OpenDocument (.odt)</em>.
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
                    <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Convertendo…
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        )}
      </main>
      <Toaster theme={theme} />
    </div>
  );
}
