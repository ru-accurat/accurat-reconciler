# Archived one-shot scripts

These scripts were already run against production Supabase. Kept here for
historical reference and as templates if a similar one-off ever needs writing
again. Do **not** re-run them — at best they are no-ops, at worst they could
overwrite hand-corrected data.

| Script | Last run | What it did |
|---|---|---|
| `migrate-to-supabase.mjs` | ~2026-04-21 | Imported the original Electron-app local data into Supabase. The Electron variant has been deleted; nothing to migrate. |
| `backfill-direction.mjs` | 2026-04-30 | Re-derived `direction` (incoming/outgoing) for 67 misclassified docs after the Zelle-marker rewrite of `detectDirection`. |
| `backfill-vendors.mjs` | 2026-04-30 | Re-derived `extractedVendor` after the `Attn` sublabel-stopword + `SELF_ALIASES` fixes. |
| `backfill-extraction-rules.mjs` | 2026-04-30 | Inferred `vendorExtractionRules` from existing manual matches (label-before-amount/date detection). Superseded by ongoing in-app learning + `reextract-all.mjs`. |
| `backfill-templates.mjs` | 2026-04-30 | Seeded `invoiceTemplates` from existing manual matches (per-doc signature → contact). Superseded by ongoing in-app learning. |
| `backfill-thumbnails.mjs` | 2026-04-30 | Reconciled `thumbnailPath` against Storage for 91 docs whose generation completed but whose Supabase record had been overwritten by the auto-save race. |

Active scripts (still useful as ongoing tooling, not in this folder):

- `inspect-vendors.mjs` — read-only vendor diagnostic
- `reextract-all.mjs` — batch re-extraction whenever `/api/pdf` logic changes
- `rematch-unmatched.mjs` — re-runs the matcher across unmatched docs (mirrors `/api/rematch-unmatched`)
- `copy-pdf-worker.mjs` — postinstall hook, copies pdfjs worker into `public/`
