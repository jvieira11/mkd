# mkd: arquivos para Markdown

Converte **PDF, Word (.docx), Google Docs (.docx/.odt), Excel (.xlsx), JSON, TXT e HTML** para Markdown.
Tudo roda no navegador: nenhum arquivo é enviado para servidores.

## Como funciona

- `src/converters/`: núcleo expansível, sem dependência de React. Cada formato é um `Converter` (veja `types.ts`) registrado em `index.ts`.
- `src/components/converter/`: upload, lista de arquivos, painel de opções e prévia.
- `src/routes/index.tsx`: página principal.
- `src/test/converters/`: testes (`bun run test`).

**Para adicionar um formato:** crie `src/converters/<formato>.ts` exportando um `Converter` e registre-o em `src/converters/index.ts`.
A interface (aceitar o arquivo, opções, prévia e download) se ajusta sozinha.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d3d7948a-367c-4703-96ca-c195d03c7174).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
