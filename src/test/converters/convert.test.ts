import { describe, expect, it } from "vitest";
import { convertFile } from "@/converters";
import type { Converter, ConversionProgress } from "@/converters/types";

const slow: Converter = {
  id: "slow",
  label: "Lento",
  extensions: [".slow"],
  mimeTypes: [],
  async convert(_file, { onProgress, signal }) {
    for (let n = 1; n <= 3; n++) {
      signal.throwIfAborted();
      await new Promise((r) => setTimeout(r, 5));
      onProgress({ done: n, total: 3, unit: "parte" });
    }
    return { markdown: "pronto", assets: [], warnings: [] };
  },
};

describe("convertFile", () => {
  it("repassa o progresso do conversor", async () => {
    const seen: ConversionProgress[] = [];
    const result = await convertFile(
      slow,
      new File(["x"], "a.slow"),
      {},
      {
        onProgress: (p) => seen.push(p),
      },
    );
    expect(result.markdown).toBe("pronto\n");
    expect(seen.map((p) => p.done)).toEqual([1, 2, 3]);
  });

  it("interrompe quando o sinal é cancelado", async () => {
    const controller = new AbortController();
    const promise = convertFile(
      slow,
      new File(["x"], "a.slow"),
      {},
      {
        signal: controller.signal,
        onProgress: (p) => p.done === 1 && controller.abort(),
      },
    );
    await expect(promise).rejects.toThrow();
  });
});
