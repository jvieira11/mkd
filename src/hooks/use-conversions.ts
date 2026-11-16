import { useCallback, useRef, useState } from "react";
import { convertFile, registry } from "@/converters";
import type {
  ConversionProgress,
  ConversionResult,
  Converter,
  ConverterOptionValues,
} from "@/converters/types";

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
  progress?: ConversionProgress | undefined;
}

let nextId = 0;
const PROGRESS_INTERVAL_MS = 100;

/** Estado da fila de conversões. Tudo roda no navegador; nenhum arquivo é enviado. */
export function useConversions() {
  const [items, setItems] = useState<ConversionItem[]>([]);
  /** Opções escolhidas por conversor, reaproveitadas nos próximos arquivos do mesmo tipo. */
  const optionMemory = useRef<Record<string, ConverterOptionValues>>({});
  /** Conversões em andamento, para poder cancelar ao remover o arquivo. */
  const controllers = useRef(new Map<string, AbortController>());
  /** Arquivos removidos que ainda estavam esperando na fila. */
  const removed = useRef(new Set<string>());

  const patch = useCallback((id: string, changes: Partial<ConversionItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const run = useCallback(
    async (item: ConversionItem) => {
      if (!item.converter || removed.current.has(item.id)) return;
      controllers.current.get(item.id)?.abort();
      const controller = new AbortController();
      controllers.current.set(item.id, controller);

      patch(item.id, {
        status: "converting",
        error: undefined,
        options: item.options,
        progress: undefined,
      });
      const start = performance.now();
      let lastProgress = 0;
      try {
        const result = await convertFile(item.converter, item.file, item.options, {
          signal: controller.signal,
          onProgress: (progress) => {
            const now = performance.now();
            if (now - lastProgress < PROGRESS_INTERVAL_MS && progress.done < progress.total) return;
            lastProgress = now;
            patch(item.id, { progress });
          },
        });
        patch(item.id, {
          status: "done",
          result,
          durationMs: performance.now() - start,
          progress: undefined,
        });
      } catch (error) {
        if (controller.signal.aborted) return; // removido ou reconvertido: nada a mostrar
        console.error(error);
        patch(item.id, {
          status: "error",
          result: undefined,
          progress: undefined,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (controllers.current.get(item.id) === controller) controllers.current.delete(item.id);
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
      // Converte em sequência para não disputar memória com vários arquivos grandes.
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
    removed.current.add(id);
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setItems((prev) => {
      prev.forEach((it) => removed.current.add(it.id));
      return [];
    });
  }, []);

  return { items, addFiles, updateOptions, remove, clear, retry: run };
}
