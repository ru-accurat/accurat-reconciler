-- Reconciler — schema reference
--
-- The live schema is created by:
--   supabase/migrations/001_relational_schema.sql
--
-- That migration defines the relational tables every new client write
-- targets (categories, contacts, transactions, documents, the
-- document_transactions junction, categorization_rules, vendor_aliases,
-- invoice_templates, vendor_extraction_rules, app_settings).
--
-- The legacy `app_data` single-table JSONB blob below is kept as
-- forensic reference; it will be dropped after a verification window.

-- ----------------------------------------------------------------------
-- Legacy JSONB blob — read-only forensic copy. NEW CODE DOES NOT WRITE.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_data' AND policyname='Allow all access') THEN
    CREATE POLICY "Allow all access" ON app_data FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ----------------------------------------------------------------------
-- Storage bucket: `documents` (PDFs + thumbnails). Created via Supabase
-- Dashboard. Anon-key INSERT/UPDATE/DELETE granted; the dedicated `move`
-- action is intentionally not granted (client uses copy+remove instead).
-- ----------------------------------------------------------------------
