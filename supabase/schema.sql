-- Reconciler Web — Supabase Schema
-- Single-table JSON document store (mirrors the Electron JSON file approach)
-- This keeps the migration simple and preserves the existing data shape.

CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (but allow all operations for now — no auth)
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access (single-user app)
CREATE POLICY "Allow all access" ON app_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage bucket for document files (PDFs, invoices)
-- Run this via Supabase Dashboard > Storage > New Bucket
-- Bucket name: documents
-- Public: false

-- Seed the initial data rows so upserts work
INSERT INTO app_data (key, value) VALUES
  ('transactions', '{"version": 1, "lastModified": null, "transactions": []}'),
  ('contacts', '{"version": 1, "lastModified": null, "contacts": []}'),
  ('categories', '{"version": 1, "lastModified": null, "categories": []}'),
  ('rules', '{"version": 1, "lastModified": null, "rules": []}'),
  ('documents', '{"version": 1, "lastModified": null, "documents": []}'),
  ('vendorAliases', '{"version": 1, "lastModified": null, "aliases": []}'),
  ('settings', '{}')
ON CONFLICT (key) DO NOTHING;
