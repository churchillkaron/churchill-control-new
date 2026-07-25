BEGIN;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE journal_number IS NOT NULL
    GROUP BY
      organization_id,
      entity_id,
      journal_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enable atomic journal numbering: duplicate scoped journal numbers exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entry_lines
    WHERE line_number IS NOT NULL
    GROUP BY
      journal_entry_id,
      line_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enable atomic journal lines: duplicate line numbers exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.general_ledger
    WHERE journal_entry_line_id IS NOT NULL
    GROUP BY
      organization_id,
      journal_entry_line_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enable atomic ledger posting: duplicate ledger lines exist';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS
  journal_entries_org_entity_number_uq
ON public.journal_entries (
  organization_id,
  entity_id,
  journal_number
);

CREATE UNIQUE INDEX IF NOT EXISTS
  journal_entries_org_entity_idempotency_uq
ON public.journal_entries (
  organization_id,
  entity_id,
  idempotency_key
)
WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  journal_entry_lines_journal_number_uq
ON public.journal_entry_lines (
  journal_entry_id,
  line_number
)
WHERE line_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  general_ledger_org_journal_line_uq
ON public.general_ledger (
  organization_id,
  journal_entry_line_id
)
WHERE journal_entry_line_id IS NOT NULL;

CREATE OR REPLACE FUNCTION
  public.finance_post_journal_atomic(
    p_organization_id uuid,
    p_entity_id uuid,
    p_posting_date date,
    p_document_date date,
    p_journal_type text,
    p_reference text,
    p_source_module text,
    p_source_document text,
    p_source_document_id uuid,
    p_description text,
    p_currency_code text,
    p_exchange_rate numeric,
    p_lines jsonb,
    p_created_by text,
    p_idempotency_key text
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_id uuid;
  v_period_status text;
  v_idempotency_key text;

  v_next_number bigint;
  v_journal_number text;

  v_total_debit numeric;
  v_total_credit numeric;

  v_line record;
  v_line_row public.journal_entry_lines%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_existing_journal public.journal_entries%ROWTYPE;

  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
  v_balance numeric;

  v_entries jsonb;
  v_ledger_count integer;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id required';
  END IF;

  IF p_posting_date IS NULL THEN
    RAISE EXCEPTION 'posting_date required';
  END IF;

  IF NULLIF(BTRIM(p_currency_code), '') IS NULL THEN
    RAISE EXCEPTION 'currency_code required';
  END IF;

  IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'exchange_rate must be positive';
  END IF;

  IF p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) < 2
  THEN
    RAISE EXCEPTION
      'A journal requires at least two lines';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text ||
      ':' ||
      p_entity_id::text,
      0
    )
  );

  PERFORM 1
  FROM public.legal_entities
  WHERE id = p_entity_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Entity does not belong to organization';
  END IF;

  SELECT
    accounting_periods.id,
    accounting_periods.status
  INTO
    v_period_id,
    v_period_status
  FROM public.accounting_periods
  WHERE organization_id = p_organization_id
    AND entity_id = p_entity_id
    AND p_posting_date BETWEEN
      start_date AND end_date
  ORDER BY start_date DESC
  LIMIT 1
  FOR UPDATE;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION
      'No accounting period covers posting date %',
      p_posting_date;
  END IF;

  IF LOWER(COALESCE(v_period_status, ''))
     NOT IN ('open', 'active')
  THEN
    RAISE EXCEPTION
      'Accounting period is not open';
  END IF;

  SELECT
    COALESCE(
      SUM(
        COALESCE(
          NULLIF(line_item->>'debit', '')::numeric,
          0
        )
      ),
      0
    ),
    COALESCE(
      SUM(
        COALESCE(
          NULLIF(line_item->>'credit', '')::numeric,
          0
        )
      ),
      0
    )
  INTO
    v_total_debit,
    v_total_credit
  FROM jsonb_array_elements(p_lines)
    AS source_lines(line_item);

  IF ROUND(v_total_debit, 2)
     <> ROUND(v_total_credit, 2)
  THEN
    RAISE EXCEPTION
      'UNBALANCED JOURNAL: debit=% credit=%',
      ROUND(v_total_debit, 2),
      ROUND(v_total_credit, 2);
  END IF;

  IF ROUND(v_total_debit, 2) <= 0 THEN
    RAISE EXCEPTION
      'Journal total must be positive';
  END IF;

  v_idempotency_key =
    NULLIF(BTRIM(p_idempotency_key), '');

  IF v_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_journal
    FROM public.journal_entries
    WHERE organization_id = p_organization_id
      AND entity_id = p_entity_id
      AND idempotency_key = v_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      SELECT COALESCE(
        jsonb_agg(
          to_jsonb(journal_entry_lines)
          ORDER BY line_number
        ),
        '[]'::jsonb
      )
      INTO v_entries
      FROM public.journal_entry_lines
      WHERE journal_entry_id =
        v_existing_journal.id;

      SELECT COUNT(*)
      INTO v_ledger_count
      FROM public.general_ledger
      WHERE journal_entry_id =
        v_existing_journal.id;

      RETURN jsonb_build_object(
        'journal',
        to_jsonb(v_existing_journal),
        'entries',
        v_entries,
        'ledger',
        jsonb_build_object(
          'success',
          true,
          'idempotentReplay',
          true,
          'journalEntryId',
          v_existing_journal.id,
          'ledgerLines',
          v_ledger_count
        )
      );
    END IF;
  END IF;

  SELECT
    COALESCE(
      MAX(
        COALESCE(
          NULLIF(
            SUBSTRING(
              journal_number
              FROM '([0-9]+)$'
            ),
            ''
          )::bigint,
          0
        )
      ),
      0
    ) + 1
  INTO v_next_number
  FROM public.journal_entries
  WHERE organization_id = p_organization_id
    AND entity_id = p_entity_id;

  v_journal_number =
    'JE-' ||
    LPAD(v_next_number::text, 8, '0');

  INSERT INTO public.journal_entries (
    organization_id,
    entity_id,
    legal_entity_id,
    period_id,

    journal_number,
    entry_number,
    entry_date,
    posting_date,
    document_date,

    journal_type,
    reference,

    source_type,
    source_id,
    source_module,
    source_document,
    source_document_id,

    description,
    currency_code,
    exchange_rate,

    status,
    created_by,
    idempotency_key
  )
  VALUES (
    p_organization_id,
    p_entity_id,
    p_entity_id,
    v_period_id,

    v_journal_number,
    v_journal_number,
    p_posting_date,
    p_posting_date,
    COALESCE(
      p_document_date,
      p_posting_date
    ),

    COALESCE(
      NULLIF(BTRIM(p_journal_type), ''),
      'GENERAL'
    ),
    NULLIF(BTRIM(p_reference), ''),

    NULLIF(BTRIM(p_source_module), ''),
    p_source_document_id,
    NULLIF(BTRIM(p_source_module), ''),
    NULLIF(BTRIM(p_source_document), ''),
    p_source_document_id,

    NULLIF(BTRIM(p_description), ''),
    UPPER(BTRIM(p_currency_code)),
    p_exchange_rate,

    'POSTED',
    p_created_by,
    v_idempotency_key
  )
  RETURNING *
  INTO v_journal;

  FOR v_line IN
    SELECT
      line_item,
      line_number
    FROM jsonb_array_elements(p_lines)
      WITH ORDINALITY
      AS source_lines(
        line_item,
        line_number
      )
  LOOP
    IF NULLIF(
      BTRIM(v_line.line_item->>'account_id'),
      ''
    ) IS NULL
    THEN
      RAISE EXCEPTION
        'account_id required on line %',
        v_line.line_number;
    END IF;

    v_account_id =
      (v_line.line_item->>'account_id')::uuid;

    v_debit =
      COALESCE(
        NULLIF(
          v_line.line_item->>'debit',
          ''
        )::numeric,
        0
      );

    v_credit =
      COALESCE(
        NULLIF(
          v_line.line_item->>'credit',
          ''
        )::numeric,
        0
      );

    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION
        'Negative amount on line %',
        v_line.line_number;
    END IF;

    IF (
      v_debit > 0 AND v_credit > 0
    ) OR (
      v_debit = 0 AND v_credit = 0
    ) THEN
      RAISE EXCEPTION
        'Line % must contain either debit or credit',
        v_line.line_number;
    END IF;

    PERFORM 1
    FROM public.chart_of_accounts
    WHERE id = v_account_id
      AND organization_id = p_organization_id
      AND entity_id = p_entity_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Account % is outside organization/entity scope',
        v_account_id;
    END IF;

    INSERT INTO public.journal_entry_lines (
      organization_id,
      entity_id,
      legal_entity_id,
      period_id,

      journal_entry_id,
      line_number,
      account_id,

      department_id,
      cost_center_id,
      party_id,
      project_id,

      description,
      currency_code,
      exchange_rate,

      debit,
      credit,
      created_by
    )
    VALUES (
      p_organization_id,
      p_entity_id,
      p_entity_id,
      v_period_id,

      v_journal.id,
      v_line.line_number,
      v_account_id,

      NULLIF(
        v_line.line_item->>'department_id',
        ''
      )::uuid,

      NULLIF(
        v_line.line_item->>'cost_center_id',
        ''
      )::uuid,

      NULLIF(
        v_line.line_item->>'party_id',
        ''
      )::uuid,

      NULLIF(
        v_line.line_item->>'project_id',
        ''
      )::uuid,

      NULLIF(
        BTRIM(
          v_line.line_item->>'description'
        ),
        ''
      ),

      UPPER(BTRIM(p_currency_code)),
      p_exchange_rate,

      v_debit,
      v_credit,
      p_created_by
    )
    RETURNING *
    INTO v_line_row;

    v_balance = v_debit - v_credit;

    INSERT INTO public.general_ledger (
      organization_id,
      entity_id,
      period_id,

      journal_entry_id,
      journal_entry_line_id,
      account_id,

      department_id,
      cost_center_id,
      party_id,
      project_id,

      description,

      debit,
      credit,
      balance,
      amount,
      entry_type,

      currency,
      currency_code,
      exchange_rate,

      transaction_date,
      posting_date,
      posting_period,

      reference_type,
      reference_id,
      created_by
    )
    VALUES (
      p_organization_id,
      p_entity_id,
      v_period_id,

      v_journal.id,
      v_line_row.id,
      v_account_id,

      v_line_row.department_id,
      v_line_row.cost_center_id,
      v_line_row.party_id,
      v_line_row.project_id,

      v_line_row.description,

      v_debit,
      v_credit,
      v_balance,
      ABS(v_balance),

      CASE
        WHEN v_debit > 0
          THEN 'debit'
        ELSE 'credit'
      END,

      UPPER(BTRIM(p_currency_code)),
      UPPER(BTRIM(p_currency_code)),
      p_exchange_rate,

      p_posting_date,
      p_posting_date,
      TO_CHAR(
        p_posting_date,
        'YYYY-MM'
      ),

      NULLIF(BTRIM(p_source_module), ''),
      p_source_document_id,
      p_created_by
    );
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(journal_entry_lines)
      ORDER BY line_number
    ),
    '[]'::jsonb
  )
  INTO v_entries
  FROM public.journal_entry_lines
  WHERE journal_entry_id = v_journal.id;

  SELECT COUNT(*)
  INTO v_ledger_count
  FROM public.general_ledger
  WHERE journal_entry_id = v_journal.id;

  RETURN jsonb_build_object(
    'journal',
    to_jsonb(v_journal),
    'entries',
    v_entries,
    'ledger',
    jsonb_build_object(
      'success',
      true,
      'idempotentReplay',
      false,
      'journalEntryId',
      v_journal.id,
      'ledgerLines',
      v_ledger_count
    )
  );
END;
$$;

REVOKE ALL
ON FUNCTION
  public.finance_post_journal_atomic(
    uuid,
    uuid,
    date,
    date,
    text,
    text,
    text,
    text,
    uuid,
    text,
    text,
    numeric,
    jsonb,
    text,
    text
  )
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION
  public.finance_post_journal_atomic(
    uuid,
    uuid,
    date,
    date,
    text,
    text,
    text,
    text,
    uuid,
    text,
    text,
    numeric,
    jsonb,
    text,
    text
  )
TO service_role;

COMMENT ON FUNCTION
  public.finance_post_journal_atomic(
    uuid,
    uuid,
    date,
    date,
    text,
    text,
    text,
    text,
    uuid,
    text,
    text,
    numeric,
    jsonb,
    text,
    text
  )
IS
  'Canonical atomic Finance posting boundary. Creates journal header, lines and ledger entries in one transaction with scoped numbering, period locking and idempotency.';

COMMIT;
