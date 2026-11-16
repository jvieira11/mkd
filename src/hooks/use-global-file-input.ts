import { useEffect, useRef, useState } from "react";

let pasteCount = 0;

/**
 * Entrada de arquivos em qualquer ponto da página:
 * - arrastar e soltar arquivos fora da área de upload;
 * - colar (Ctrl+V) arquivos, conteúdo formatado (Google Docs, Word, páginas web) ou texto.
 */
export function useGlobalFileInput(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const callback = useRef(onFiles);
  callback.current = onFiles;

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      // A área de upload trata o próprio drop; aqui só o que caiu fora dela.
      if ((e.target as HTMLElement | null)?.closest?.("[data-dropzone]")) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) callback.current(files);
    };

    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, [contenteditable='true']")) return;
      const data = e.clipboardData;
      if (!data) return;
      const file = clipboardToFile(data);
      if (!file) return;
      e.preventDefault();
      callback.current(Array.isArray(file) ? file : [file]);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  return { dragging };
}

/** Converte o conteúdo da área de transferência em arquivo(s) para a fila de conversão. */
export function clipboardToFile(data: DataTransfer): File | File[] | null {
  const files = Array.from(data.files ?? []);
  if (files.length) return files;

  const n = ++pasteCount;
  const html = data.getData("text/html");
  if (html.trim()) return new File([html], `colado-${n}.html`, { type: "text/html" });

  const text = data.getData("text/plain");
  if (!text.trim()) return null;
  const trimmed = text.trim();
  if (/^[[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return new File([text], `colado-${n}.json`, { type: "application/json" });
    } catch {
      /* não é JSON: segue como texto */
    }
  }
  return new File([text], `colado-${n}.txt`, { type: "text/plain" });
}
