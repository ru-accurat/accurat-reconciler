-- Reconciler — Phase 4: relational schema migration
--
-- Replaces the single `app_data` JSONB blob (one row per entity type, full
-- array re-serialized on every edit) with proper tables — foreign keys,
-- per-row updates, indexes for the hot query paths.
--
-- The legacy `app_data` table is kept around so the one-shot data migration
-- (`scripts/_archive/migrate-to-tables.mjs`) can read it; remove once
-- everything is verified.

-- ----------------------------------------------------------------------
-- Categories
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#9CA3AF',
  parent_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- ----------------------------------------------------------------------
-- Contacts
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  legal_entity_name     TEXT NOT NULL DEFAULT '',
  type                  TEXT NOT NULL CHECK (type IN ('vendor','client','service')),
  vat_tax_id            TEXT NOT NULL DEFAULT '',
  address               TEXT NOT NULL DEFAULT '',
  email                 TEXT NOT NULL DEFAULT '',
  phone                 TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  transaction_patterns  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source                TEXT NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual','auto-detected','invoice-extracted')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);

-- ----------------------------------------------------------------------
-- Transactions
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                          TEXT PRIMARY KEY,
  hash                        TEXT NOT NULL UNIQUE,
  date                        DATE NOT NULL,
  raw_description             TEXT NOT NULL,
  amount                      NUMERIC(14,2) NOT NULL,
  type                        TEXT NOT NULL CHECK (type IN ('debit','credit')),
  contact_id                  TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  category_id                 TEXT REFERENCES categories(id) ON DELETE SET NULL,
  billing_period_year         SMALLINT,
  billing_period_month        SMALLINT,
  billing_period_override     BOOLEAN NOT NULL DEFAULT FALSE,
  status                      TEXT NOT NULL DEFAULT 'unreconciled'
                                CHECK (status IN ('unreconciled','reconciled','flagged','contract','tax')),
  split_parts                 JSONB,
  notes                       TEXT NOT NULL DEFAULT '',
  rule_id_applied             TEXT,
  imported_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status   ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_contact  ON transactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

-- ----------------------------------------------------------------------
-- Documents
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id                          TEXT PRIMARY KEY,
  original_filename           TEXT NOT NULL,
  stored_path                 TEXT NOT NULL UNIQUE,
  thumbnail_path              TEXT,
  historical_paths            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  extracted_text              TEXT NOT NULL DEFAULT '',
  extracted_date              DATE,
  extracted_amount            NUMERIC(14,2),
  extracted_vendor            TEXT,
  extracted_invoice_number    TEXT,
  extracted_billing_year      SMALLINT,
  extracted_billing_month     SMALLINT,
  extracted_entities          JSONB,
  direction                   TEXT NOT NULL DEFAULT 'incoming'
                                CHECK (direction IN ('incoming','outgoing')),
  match_confidence            NUMERIC(4,3) NOT NULL DEFAULT 0,
  match_method                TEXT NOT NULL DEFAULT 'auto'
                                CHECK (match_method IN ('auto','manual')),
  scanned_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_extracted_date ON documents(extracted_date);
CREATE INDEX IF NOT EXISTS idx_documents_vendor         ON documents(extracted_vendor);
CREATE INDEX IF NOT EXISTS idx_documents_direction      ON documents(direction);

-- Junction: docs ↔ transactions (one doc can match many txns; one txn can
-- be matched by many docs).
CREATE TABLE IF NOT EXISTS document_transactions (
  document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_txn_txn ON document_transactions(transaction_id);

-- ----------------------------------------------------------------------
-- Categorization rules
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorization_rules (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 0,
  match_type      TEXT NOT NULL CHECK (match_type IN ('exact','contains','regex')),
  pattern         TEXT NOT NULL,
  case_sensitive  BOOLEAN NOT NULL DEFAULT FALSE,
  category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
  contact_id      TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  applied_count   INTEGER NOT NULL DEFAULT 0,
  source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','suggested')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON categorization_rules(priority);
CREATE INDEX IF NOT EXISTS idx_rules_enabled  ON categorization_rules(enabled);

-- ----------------------------------------------------------------------
-- Vendor aliases (extracted vendor → contact)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_aliases (
  extracted_vendor  TEXT PRIMARY KEY,
  contact_id        TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  learned_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- Invoice templates (signature-based contact prediction)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_templates (
  id                   TEXT PRIMARY KEY,
  contact_id           TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  signature            JSONB NOT NULL,
  learned_from_doc_id  TEXT,
  learned_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_templates_contact ON invoice_templates(contact_id);

-- ----------------------------------------------------------------------
-- Vendor extraction rules (vendor + field + label → evidence[])
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_extraction_rules (
  id                  TEXT PRIMARY KEY,
  vendor_normalized   TEXT NOT NULL,
  field               TEXT NOT NULL CHECK (field IN ('amount','date')),
  label               TEXT NOT NULL,
  evidence            JSONB NOT NULL DEFAULT '[]'::JSONB
);
CREATE INDEX IF NOT EXISTS idx_extraction_rules_vendor_field
  ON vendor_extraction_rules(vendor_normalized, field);

-- ----------------------------------------------------------------------
-- App settings (single row keyed by 'main')
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  id                   TEXT PRIMARY KEY DEFAULT 'main',
  version              INTEGER NOT NULL DEFAULT 1,
  default_bank         TEXT NOT NULL DEFAULT 'chase',
  csv_date_format      TEXT NOT NULL DEFAULT 'MM-DD-YYYY',
  theme                TEXT NOT NULL DEFAULT 'light',
  default_sort_field   TEXT NOT NULL DEFAULT 'date',
  default_sort_dir     TEXT NOT NULL DEFAULT 'desc',
  date_proximity_days  INTEGER NOT NULL DEFAULT 30,
  business_name        TEXT NOT NULL DEFAULT '',
  business_tax_id      TEXT NOT NULL DEFAULT '',
  custom_amount_labels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  contract_patterns    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT app_settings_singleton CHECK (id = 'main')
);
INSERT INTO app_settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------
-- RLS — single-user app, allow anon
-- ----------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['categories','contacts','transactions','documents',
    'document_transactions','categorization_rules','vendor_aliases',
    'invoice_templates','vendor_extraction_rules','app_settings']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS "anon all" ON %I; CREATE POLICY "anon all" ON %I FOR ALL USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;
