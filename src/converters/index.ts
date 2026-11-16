import { ConverterRegistry } from "./registry";
import { pdfConverter } from "./pdf";
import { docxConverter } from "./docx";
import { odtConverter } from "./odt";
import { xlsxConverter } from "./xlsx";
import { jsonConverter } from "./json";
import { textConverter } from "./text";
import { htmlConverter } from "./html";

/** Registro global. A ordem define a ordem de exibição na interface. */
export const registry = new ConverterRegistry()
  .register(pdfConverter)
  .register(docxConverter)
  .register(odtConverter)
  .register(xlsxConverter)
  .register(jsonConverter)
  .register(textConverter)
  .register(htmlConverter);

export { convertFile } from "./convert";
export type * from "./types";
