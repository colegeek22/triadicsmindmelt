# CLAUDE.md

Angular 21 single-page app exported from Google AI Studio ("Triadic Mind Studio"), using the Gemini API via `@google/genai`.

**Features:** Everything in triadicsandbox plus voice input (microphone + audio visualiser) and a Vision Studio (image analysis, Imagen image generation, Veo video generation).

## Layout
- `index.tsx` — bootstrap (zoneless change detection). AI Studio requires this filename.
- `src/app.component.ts` — root, renders `<app-studio>`.
- `src/components/chat/chat.component.*` — the whole UI (`StudioComponent`), state held in signals.
- `src/services/gemini.service.ts` — every Gemini call and prompt template.
- `index.html` — Tailwind via CDN plus an import map used only inside AI Studio; `ng build` bundles from node_modules instead.

## Commands
- `npm install` then `npx ng build` (production build to `dist/`) — run this to check changes; there are no tests or linter.
- `npm run dev` — dev server on port 3000.

## Gotchas
- TypeScript must stay within `>=5.9 <6.0` (peer requirement of `@angular/build` 21); older versions make `npm install` fail with ERESOLVE.
- Get services through `inject()`, never `new` (`DomSanitizer` is abstract, so `new` doesn't compile).
- The API key is read from `process.env.API_KEY`, which AI Studio injects at runtime. A plain local build has no `process`, so Gemini calls fail outside AI Studio unless a build-time `define` is added. The README's `GEMINI_API_KEY` / `.env.local` steps don't match the code. Any key shipped this way ends up visible in the client bundle.
- Sibling repo `triadicsandbox` / `triadicsmindmelt` shares most of this code; when you fix a bug in one, check the other for it.
