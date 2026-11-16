import { useCallback, useRef, useState } from "react";
import { convertFile, registry } from "@/converters";
import type { ConversionResult, Converter, ConverterOptionValues } from "@/converters/types";

export type ConversionStatus = "pending" | "converting" | "done" | "error" | "unsupported";

export interface ConversionItem {
  id: string;
  file: File;
  converter: Converter | undefined;
  options: ConverterOptionValues;
  status: ConversionStatus;
  result?: ConversionResult | undefined;
  error?: string | undefined;
  durationMs?: number | undefined;
}

let nextId = 0;

/** Estado da fila de conversões. Tudo roda no navegador; nenhum arquivo é enviado. */
export function useConversions() {
  const [items, setItems] = useState<ConversionItem[]>([]);
  /** Opções escolhidas por conversor, reaproveitadas nos próximos arquivos do mesmo tipo. */
  const optionMemory = useRef<Record<string, ConverterOptionValues>>({});

  const patch = useCallback((id: string, changes: Partial<ConversionItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const run = useCallback(
    async (item: ConversionItem) => {
      if (!item.converter) return;
      patch(item.id, { status: "converting", error: undefined, options: item.options });
      const start = performance.now();
      try {
        const result = await convertFile(item.converter, item.file, item.options);
        patch(item.id, { status: "done", result, durationMs: performance.now() - start });
      } catch (error) {
        console.error(error);
        patch(item.id, {
          status: "error",
          result: undefined,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [patch],
  );

  const addFiles = useCallback(
    (files: File[]): ConversionItem[] => {
      const added = files.map((file): ConversionItem => {
        const converter = registry.find(file.name, file.type);
        const options = converter
          ? { ...registry.defaultOptions(converter), ...optionMemory.current[converter.id] }
          : {};
        return {
          id: `f${++nextId}`,
          file,
          converter,
          options,
          status: converter ? "pending" : "unsupported",
          error: converter ? undefined : "Formato não suportado.",
        };
      });
      setItems((prev) => [...prev, ...added]);
      // Converte em sequência para não travar a interface com vários arquivos grandes.
      void (async () => {
        for (const item of added) await run(item);
      })();
      return added;
    },
    [run],
  );

  const updateOptions = useCallback(
    (item: ConversionItem, options: ConverterOptionValues) => {
      if (item.converter) optionMemory.current[item.converter.id] = options;
      void run({ ...item, options });
    },
    [run],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { items, addFiles, updateOptions, remove, clear, retry: run };
}
