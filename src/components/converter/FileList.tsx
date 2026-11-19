import { AlertCircle, CheckCircle2, FileText, Loader2, X } from "lucide-react";
import type { ConversionItem } from "@/hooks/use-conversions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";

interface FileListProps {
  items: ConversionItem[];
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export function FileList({ items, selectedId, onSelect, onRemove }: FileListProps) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(item.id)}
            className={cn(
              "group flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              item.id === selectedId
                ? "border-brand/50 bg-brand-soft"
                : "border-transparent hover:bg-accent/60",
            )}
          >
            <StatusIcon status={item.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={item.file.name}>
                {item.file.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatBytes(item.file.size)}
                {item.status === "converting" && item.progress
                  ? ` · ${item.progress.detail ?? `${item.progress.unit} ${item.progress.done} de ${item.progress.total}`}`
                  : ""}
                {item.status === "error" || item.status === "unsupported" ? ` · ${item.error}` : ""}
                {item.status === "done" && item.result?.warnings.length
                  ? ` · ${item.result.warnings.length} ${item.result.warnings.length === 1 ? "aviso" : "avisos"}`
                  : ""}
              </p>
              {item.status === "converting" && item.progress && item.progress.total > 0 && (
                <Progress
                  value={(item.progress.done / item.progress.total) * 100}
                  className="mt-1.5 h-1"
                  aria-label={`Progresso de ${item.file.name}`}
                />
              )}
            </div>
            {item.converter && (
              <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                {item.converter.label}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100"
              aria-label={`Remover ${item.file.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
            >
              <X />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusIcon({ status }: { status: ConversionItem["status"] }) {
  switch (status) {
    case "converting":
    case "pending":
      return (
        <Loader2
          className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
          aria-label="Convertendo"
        />
      );
    case "done":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" aria-label="Pronto" />;
    case "error":
    case "unsupported":
      return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-label="Erro" />;
    default:
      return <FileText className="h-4 w-4 shrink-0" />;
  }
}
