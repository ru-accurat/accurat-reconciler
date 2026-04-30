# Reconciler

## Second Brain

This project's living knowledge layer is maintained in Gabriele's Second Brain vault at
`~/Desktop/Claude/Claude_Projects/Second Brain/`. The canonical project entry is
`01 - Projects/Reconciler/README.md`.

**Protocol:** read the vault entry at the start of structural work. When material decisions,
conventions, or lessons emerge in a session, propose an update to the vault before the session ends.

## Project Overview

A bank-transaction reconciliation tool. Matches incoming transactions against expected records,
flags discrepancies, produces reconciliation reports. Used internally at Accurat.

Most of the application's data — transactions, documents, learned matches, contacts — lives in
**Supabase**. The repo defines the schema in `supabase/schema.sql` and uses Supabase Storage for
uploaded documents.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind 4** + **Zustand** for state
- **Supabase** — Postgres + Storage + Auth
- **@tanstack/react-table** — transaction grid
- **exceljs** / **papaparse** — `.xlsx` and `.csv` bank-statement parsing
- **pdf-parse** / **pdfjs-dist** — PDF statement extraction and entity extraction
- **recharts** — reconciliation visualizations
- GitHub: <https://github.com/ru-accurat/accurat-reconciler>

## Layout

- `src/` — application code (`@/*` import alias)
- `supabase/schema.sql` — database schema
- `scripts/` — one-off operational scripts (e.g. `migrate-to-supabase.mjs`)
- `public/` — static assets

## Development

```bash
npm run dev            # Next.js dev with Turbopack
npm run build          # production build
npm run start          # run production build
```

## History

This repo was originally part of a dual-variant project: an Electron desktop app at the workspace
root with this Next.js web variant nested inside. As of 2026-04-30 the web variant supersedes the
desktop, the desktop code was deleted, and the web app was promoted to the project root. The
GitHub remote (`ru-accurat/accurat-reconciler`) was always tracking the web variant only —
the Electron source was never under git.
