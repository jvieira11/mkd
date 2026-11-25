/**
 * Contrato que todo conversor precisa seguir.
 *
 * Para adicionar um formato novo:
 *   1. crie `src/converters/<formato>.ts` exportando um `Converter`;
 *   2. adicione-o à lista em `src/converters/index.ts`.
 * A interface (upload, opções, prévia e download) se adapta sozinha.
 */

interface OptionBase {
  key: string;
  label: string;
  description?: string;
  /** Mostra a opção só quando outra opção tem determinado valor. */
  showWhen?: { key: string; equals: string | boolean };
}

/** Opção configurável exibida automaticamente na interface. */
export type ConverterOption =
  | (OptionBase & { type: "boolean"; default: boolean })
  | (OptionBase & {
      type: "select";
      default: string;
      choices: { value: string; label: string }[];
    })
  | (OptionBase & {
      type: "text";
      default: string;
      placeholder?: string;
      /** Devolve uma mensagem de erro em português, ou null se o valor é válido. */
      validate?: (value: string) => string | null;
    });

export type ConverterOptionValues = Record<string, boolean | string>;

/** Arquivo binário extraído durante a conversão (ex.: imagens). */
export interface ConversionAsset {
  /** Nome do arquivo dentro da pasta de assets, ex.: "image-1.png". */
  name: string;
  data: Uint8Array;
  mimeType: string;
}

export interface ConversionResult {
  markdown: string;
  assets: ConversionAsset[];
  warnings: string[];
}

/** Andamento de uma conversão longa (ex.: páginas de um PDF). */
export interface ConversionProgress {
  done: number;
  total: number;
  /** Unidade exibida na interface, ex.: "página". */
  unit: string;
  /** Texto que substitui o padrão "Lendo <unidade> X de Y", ex.: etapa de OCR. */
  detail?: string | undefined;
}

/** Contexto entregue ao conversor junto com o arquivo. */
export interface ConversionContext {
  options: ConverterOptionValues;
  /** Informe o andamento em conversões demoradas. Chamadas frequentes são aceitáveis. */
  onProgress: (progress: ConversionProgress) => void;
  /** Cancelado quando o usuário remove o arquivo; verifique em laços longos. */
  signal: AbortSignal;
  /**
   * Pasta relativa onde os assets devem ser referenciados no Markdown,
   * ex.: "relatorio_assets". Use `${assetDir}/${asset.name}` nos links.
   */
  assetDir: string;
}

export interface Converter {
  /** Identificador único e estável, ex.: "docx". */
  id: string;
  /** Nome exibido na interface, ex.: "Word". */
  label: string;
  /** Extensões aceitas, em minúsculas e com ponto, ex.: [".docx"]. */
  extensions: string[];
  /** MIME types aceitos (usados quando a extensão não resolve). */
  mimeTypes: string[];
  options?: ConverterOption[];
  convert(file: Blob, context: ConversionContext): Promise<ConversionResult>;
}
