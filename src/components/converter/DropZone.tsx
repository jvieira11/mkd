import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  accept: string;
  onFiles: (files: File[]) => void;
  compact?: boolean;
}

export function DropZone({ accept, onFiles, compact }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = useCallback(
    (list: FileList | null) => {
      if (list && list.length) onFiles(Array.from(list));
    },
    [onFiles],
  );

  return (
    <div
      data-dropzone
      role="button"
      tabIndex={0}
      aria-label="Selecionar arquivos para converter"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "px-4 py-5" : "px-6 py-14",
        dragging
          ? "border-brand bg-brand-soft"
          : "border-border hover:border-brand/60 hover:bg-brand-soft",
      )}
    >
      <div className="rounded-full bg-brand-soft p-3 text-brand">
        <Upload className="h-5 w-5" />
      </div>
      <div>
        <p className="font-medium">
          {compact ? "Adicionar mais arquivos" : "Arraste arquivos aqui ou clique para escolher"}
        </p>
        {!compact && (
          <p className="mt-1 text-sm text-muted-foreground">
            Vários arquivos de uma vez · PDF, DOCX, ODT, XLSX, JSON, TXT e HTML
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
