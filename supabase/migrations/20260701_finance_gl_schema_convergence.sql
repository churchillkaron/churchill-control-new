BEGIN;

CREATE TABLE IF NOT EXISTS legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  status text DEFAULT 'active',
  currency text DEFAULT 'THB',
  country text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS posting_date date,
  ADD COLUMN IF NOT EXISTS document_date date,
  ADD COLUMN IF NOT EXISTS journal_type text,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_document text,
  ADD COLUMN IF NOT EXISTS source_document_id uuid,
  ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'THB',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid,
  ADD COLUMN IF NOT EXISTS line_number integer,
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'THB',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;

ALTER TABLE general_ledger
  ADD COLUMN IF NOT EXISTS posting_date date,
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0;

UPDATE journal_entries
SET posting_date = COALESCE(posting_date, entry_date)
WHERE posting_date IS NULL;

UPDATE journal_entries
SET source_module = COALESCE(source_module, source_type)
WHERE source_module IS NULL;

UPDATE journal_entries
SET source_document_id = COALESCE(source_document_id, source_id)
WHERE source_document_id IS NULL;

UPDATE general_ledger
SET posting_date = COALESCE(posting_date, transaction_date)
WHERE posting_date IS NULL;

UPDATE general_ledger
SET currency_code = COALESCE(currency_code, currency, 'THB')
WHERE currency_code IS NULL;

UPDATE general_ledger
SET balance = COALESCE(balance, debit, 0) - COALESCE(credit, 0)
WHERE balance IS NULL;

WITH orgs AS (
  SELECT DISTINCT organization_id
  FROM journal_entries
  WHERE organization_id IS NOT NULL
  UNION
  SELECT DISTINCT organization_id
  FROM general_ledger
  WHERE organization_id IS NOT NULL
  UNION
  SELECT DISTINCT id AS organization_id
  FROM organizations
)
INSERT INTO legal_entities (
  organization_id,
  name,
  code,
  is_default,
  status
)
SELECT
  orgs.organization_id,
  COALESCE(o.name, 'Default Entity'),
  'DEFAULT',
  true,
  'active'
FROM orgs
LEFT JOIN organizations o
  ON o.id = orgs.organization_id
WHERE NOT EXISTS (
  SELECT 1
  FROM legal_entities le
  WHERE le.organization_id = orgs.organization_id
);

UPDATE journal_entries je
SET legal_entity_id = le.id
FROM legal_entities le
WHERE je.organization_id = le.organization_id
AND le.is_default = true
AND je.legal_entity_id IS NULL;

UPDATE journal_entry_lines jel
SET legal_entity_id = je.legal_entity_id
FROM journal_entries je
WHERE jel.journal_entry_id = je.id
AND jel.legal_entity_id IS NULL;

UPDATE general_ledger gl
SET legal_entity_id = le.id
FROM legal_entities le
WHERE gl.organization_id = le.organization_id
AND le.is_default = true
AND gl.legal_entity_id IS NULL;

COMMIT;
