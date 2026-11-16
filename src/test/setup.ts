import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// O jsdom não implementa Blob.text()/arrayBuffer(); os navegadores reais implementam.
function readAs<T>(blob: Blob, method: "readAsText" | "readAsArrayBuffer"): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error);
    reader[method](blob);
  });
}

if (!Blob.prototype.text) {
  Blob.prototype.text = function () {
    return readAs<string>(this, "readAsText");
  };
}
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return readAs<ArrayBuffer>(this, "readAsArrayBuffer");
  };
}

// No Node o mammoth usa a entrada `buffer`; no navegador, `arrayBuffer`.
// Adapta a chamada para que o conversor rode igual ao do navegador.
vi.mock("mammoth", async () => {
  const actual = (await vi.importActual<{ default: typeof import("mammoth") }>("mammoth")).default;
  const convertToHtml: typeof actual.convertToHtml = (input, options) =>
    "arrayBuffer" in input
      ? actual.convertToHtml({ buffer: Buffer.from(input.arrayBuffer) }, options)
      : actual.convertToHtml(input, options);
  return { default: { ...actual, convertToHtml } };
});
