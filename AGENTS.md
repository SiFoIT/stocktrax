# Repository Guidelines

## Project Structure & Module Organization
Stocktrax runs on the Next.js App Router. Routes and API handlers live in `src/app` (`page.tsx` for the dashboard, route groups like `portfolio/*`, and REST endpoints under `app/api`). Domain components stay in `src/components/{charts,markets,portfolio,watchlist,ui}`. Shared state and helpers live in `src/contexts`, `src/lib` (`lib/db/schema.ts` defines SQLite), and `src/types`. Assets sit in `public/`, generated SQL in `drizzle/`, and the dev database in `data/`.

## Build, Test, and Development Commands
- `npm run dev` – hot-reloading Next.js server with API routes.
- `npm run build` – production bundle; run before sharing changes.
- `npm run start` – serve the built bundle to confirm SSR.
- `npm run lint` – Next.js ESLint; fix issues instead of disabling.
- `npx drizzle-kit generate:sqlite --config drizzle.config.ts` – regenerate SQL snapshots after schema edits.

## Coding Style & Naming Conventions
Use 2-space TypeScript modules and ES imports. Components stay `PascalCase`, hooks/utilities `camelCase`, and env constants `UPPER_SNAKE_CASE`. Compose layouts with Tailwind utilities plus `clsx`/`tailwind-merge`, ordering classes layout → spacing → color. Favor functional components, lift shared state into contexts, and import cross-domain helpers through `@/`. Run `npm run lint` (and optionally `tsc --noEmit`) before committing.

## Testing Guidelines
Automated tests are absent, so each change needs a manual plan (open the dashboard, refresh quotes, import/export CSV) plus lint/type passes. When a harness is added, collocate `*.test.ts(x)` beside the unit or inside `src/__tests__`, mirror the component name, and target deterministic work such as currency math, API formatting, and data transforms. Call out remaining manual verification in the PR.

## Commit & Pull Request Guidelines
History favors compact, imperative subjects (e.g., `Fix portfolio currency display...`). Keep the first line ≤72 characters with no trailing punctuation; use the body for motivation, schema impacts, and follow-ups. Pull requests should describe the issue, summarize the fix, link tickets, and attach screenshots or cURL output for UI/API work. Mention schema/seed touches, list commands you ran, and request reviewers for the affected domain.

## Data & Configuration Tips
Local SQLite lives in `data/stocktrax.db`; treat it as disposable dev data. Update schema via `src/lib/db/schema.ts`, regenerate artifacts with Drizzle, and commit both schema and generated files. Keep secrets in `.env.local` or platform settings. Before merging, run CSV import/export against a copy of the database to confirm file paths and permissions behave inside the sandbox.
