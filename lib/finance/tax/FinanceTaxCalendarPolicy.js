const POLICY_VERSION = "TH_PP30_CALENDAR_V1";

const THAILAND_ALIASES = new Set(["TH", "THA", "THAILAND"]);
const CHANNELS = new Set(["PAPER", "ONLINE"]);
const TAX_TIME_ZONES = Object.freeze({ THAILAND: "Asia/Bangkok" });

const THAILAND_PP30_2026 = Object.freeze({
  "2026-01": { PAPER: "2026-01-15", ONLINE: "2026-01-23" },
  "2026-02": { PAPER: "2026-02-16", ONLINE: "2026-02-23" },
  "2026-03": { PAPER: "2026-03-16", ONLINE: "2026-03-23" },
  "2026-04": { PAPER: "2026-04-16", ONLINE: "2026-04-23" },
  "2026-05": { PAPER: "2026-05-15", ONLINE: "2026-05-25" },
  "2026-06": { PAPER: "2026-06-15", ONLINE: "2026-06-23" },
  "2026-07": { PAPER: "2026-07-15", ONLINE: "2026-07-23" },
  "2026-08": { PAPER: "2026-08-17", ONLINE: "2026-08-24" },
  "2026-09": { PAPER: "2026-09-15", ONLINE: "2026-09-23" },
  "2026-10": { PAPER: "2026-10-15", ONLINE: "2026-10-26" },
  "2026-11": { PAPER: "2026-11-16", ONLINE: "2026-11-23" },
  "2026-12": { PAPER: "2026-12-15", ONLINE: "2026-12-23" },
});

const THAILAND_PP30_2026_ADJUSTMENTS = Object.freeze({
  "2026-02:PAPER": "WEEKEND",
  "2026-03:PAPER": "WEEKEND",
  "2026-04:PAPER": "PUBLIC_HOLIDAY",
  "2026-05:ONLINE": "WEEKEND",
  "2026-08:PAPER": "WEEKEND",
  "2026-08:ONLINE": "WEEKEND",
  "2026-10:ONLINE": "PUBLIC_HOLIDAY_AND_WEEKEND",
  "2026-11:PAPER": "WEEKEND",
});

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function normalizeJurisdiction(value) {
  const normalized = upper(value);
  return THAILAND_ALIASES.has(normalized) ? "THAILAND" : normalized;
}

function normalizeForm(value) {
  const normalized = upper(value).replace(/[.\s_-]+/g, "");
  if (["PP30", "P30", "VATRETURN"].includes(normalized)) return "PP30";
  return upper(value) || "PP30";
}

function normalizeChannel(value) {
  const normalized = upper(value);
  return CHANNELS.has(normalized) ? normalized : "ONLINE";
}

function parseIsoDate(value) {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateInTimeZone(value, timeZone) {
  const parsed = value instanceof Date ? value : new Date(value || Date.now());
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return map.year && map.month && map.day ? `${map.year}-${map.month}-${map.day}` : null;
}

export function getFinanceTaxLegalClock({ jurisdictionCode, now = new Date() } = {}) {
  const jurisdiction = normalizeJurisdiction(jurisdictionCode);
  const timeZone = TAX_TIME_ZONES[jurisdiction] || "UTC";
  return {
    jurisdiction_code: jurisdiction,
    time_zone: timeZone,
    legal_date: dateInTimeZone(now, timeZone),
    source: TAX_TIME_ZONES[jurisdiction] ? "JURISDICTION_POLICY" : "UTC_FALLBACK",
  };
}

function dueMonthForPeriodEnd(periodEnd) {
  const parsed = parseIsoDate(periodEnd);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1));
}

function baseDueDate(periodEnd, dueDay) {
  const dueMonth = dueMonthForPeriodEnd(periodEnd);
  if (!dueMonth) return null;
  return isoDate(new Date(Date.UTC(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth(), dueDay)));
}

function weekendAdjusted(value) {
  let parsed = parseIsoDate(value);
  if (!parsed) return null;
  while ([0, 6].includes(parsed.getUTCDay())) {
    parsed = new Date(parsed.getTime() + 86400000);
  }
  return isoDate(parsed);
}

function daysBetween(left, right) {
  const a = parseIsoDate(left);
  const b = parseIsoDate(right);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function officialCalendarUrl(dueMonthKey) {
  const [year, month] = dueMonthKey.split("-");
  return `https://www.rd.go.th/62348/archive/${year}/${Number(month)}.html`;
}

function unsupportedResolution({ jurisdictionCode, formCode, filingChannel, periodEnd }) {
  return {
    supported: false,
    policy_version: POLICY_VERSION,
    jurisdiction_code: normalizeJurisdiction(jurisdictionCode),
    form_code: normalizeForm(formCode),
    filing_channel: normalizeChannel(filingChannel),
    period_end: clean(periodEnd) || null,
    base_due_date: null,
    statutory_due_date: null,
    verification_status: "MANUAL_JURISDICTION_REQUIRED",
    requires_manual_deadline: true,
    adjustment: null,
    authority: null,
  };
}

export function resolveFinanceTaxDeadline({
  jurisdictionCode,
  formCode = "PP30",
  filingChannel = "ONLINE",
  periodEnd,
} = {}) {
  const jurisdiction = normalizeJurisdiction(jurisdictionCode);
  const form = normalizeForm(formCode);
  const channel = normalizeChannel(filingChannel);
  const dueMonth = dueMonthForPeriodEnd(periodEnd);

  if (jurisdiction !== "THAILAND" || form !== "PP30" || !dueMonth) {
    return unsupportedResolution({ jurisdictionCode, formCode, filingChannel, periodEnd });
  }

  const dueMonthKey = isoDate(dueMonth).slice(0, 7);
  const dueDay = channel === "ONLINE" ? 23 : 15;
  const base = baseDueDate(periodEnd, dueDay);
  const official = THAILAND_PP30_2026[dueMonthKey]?.[channel] || null;
  const statutory = official || weekendAdjusted(base);
  const adjustmentDays = daysBetween(base, statutory);
  const reason = THAILAND_PP30_2026_ADJUSTMENTS[`${dueMonthKey}:${channel}`]
    || (adjustmentDays > 0 ? "WEEKEND" : "NONE");
  const officialVerified = Boolean(official);

  return {
    supported: true,
    policy_version: POLICY_VERSION,
    jurisdiction_code: jurisdiction,
    jurisdiction_label: "Thailand",
    form_code: form,
    form_label: "P.P.30 VAT return",
    filing_channel: channel,
    filing_channel_label: channel === "ONLINE" ? "Revenue Department e-Filing" : "Standard filing",
    period_end: clean(periodEnd),
    due_month: dueMonthKey,
    base_due_date: base,
    statutory_due_date: statutory,
    verification_status: officialVerified
      ? "OFFICIAL_CALENDAR_VERIFIED"
      : "RULE_DERIVED_REVIEW_REQUIRED",
    requires_manual_deadline: false,
    adjustment: {
      applied: adjustmentDays > 0,
      days: adjustmentDays,
      reason,
    },
    authority: officialVerified
      ? {
          authority: "Thailand Revenue Department",
          title: `Tax calendar ${dueMonthKey}`,
          url: officialCalendarUrl(dueMonthKey),
          calendar_verified: true,
          calendar_last_reviewed: "2026-04-02",
        }
      : {
          authority: "Thailand Revenue Department",
          title: "P.P.30 filing rule - official calendar confirmation required",
          url: "https://www.rd.go.th/62348.html",
          calendar_verified: false,
          calendar_last_reviewed: null,
        },
  };
}

export function getFinanceTaxCalendarOptions(jurisdictionCode) {
  const jurisdiction = normalizeJurisdiction(jurisdictionCode);
  if (jurisdiction === "THAILAND") {
    return {
      jurisdiction_code: jurisdiction,
      supported: true,
      forms: [{ code: "PP30", label: "P.P.30 VAT return" }],
      filing_channels: [
        { code: "ONLINE", label: "Revenue Department e-Filing" },
        { code: "PAPER", label: "Standard filing" },
      ],
      default_form_code: "PP30",
      default_filing_channel: "ONLINE",
    };
  }

  return {
    jurisdiction_code: jurisdiction,
    supported: false,
    forms: [{ code: "PP30", label: "VAT return" }],
    filing_channels: [
      { code: "ONLINE", label: "Online" },
      { code: "PAPER", label: "Standard filing" },
    ],
    default_form_code: "PP30",
    default_filing_channel: "ONLINE",
  };
}

export function buildFinanceTaxCalendarMetadata({
  resolution,
  requestedDueDate,
  overrideReason,
  overrideEvidenceReference,
  actorId,
  now = new Date().toISOString(),
} = {}) {
  if (!resolution) throw new Error("tax calendar resolution required");

  const requested = clean(requestedDueDate);
  const reason = clean(overrideReason);
  const evidenceReference = clean(overrideEvidenceReference);
  const statutory = clean(resolution.statutory_due_date);

  if (!resolution.supported) {
    if (!requested) throw new Error("A governed filing due date is required for this jurisdiction");
    if (!reason || !evidenceReference) {
      throw new Error("Manual filing deadline requires a reason and authority evidence reference");
    }
    return {
      ...resolution,
      recorded_due_date: requested,
      source: "HUMAN_AUTHORITY_EVIDENCE",
      human_confirmation: {
        reason,
        evidence_reference: evidenceReference,
        confirmed_by: actorId || null,
        confirmed_at: now,
      },
      override: null,
    };
  }

  const recorded = requested || statutory;
  const isOverride = Boolean(requested && statutory && requested !== statutory);
  if (isOverride && (!reason || !evidenceReference)) {
    throw new Error("Deadline override requires a reason and authority evidence reference");
  }

  const needsHumanConfirmation = resolution.verification_status !== "OFFICIAL_CALENDAR_VERIFIED";
  if (needsHumanConfirmation && !isOverride && requested && (!reason || !evidenceReference)) {
    throw new Error("Rule-derived deadline confirmation requires a reason and authority evidence reference");
  }

  return {
    ...resolution,
    recorded_due_date: recorded,
    source: isOverride
      ? "HUMAN_OVERRIDE"
      : needsHumanConfirmation && reason && evidenceReference
        ? "HUMAN_AUTHORITY_CONFIRMATION"
        : "GOVERNED_POLICY",
    human_confirmation: !isOverride && reason && evidenceReference
      ? {
          reason,
          evidence_reference: evidenceReference,
          confirmed_by: actorId || null,
          confirmed_at: now,
        }
      : null,
    override: isOverride
      ? {
          date: recorded,
          reason,
          evidence_reference: evidenceReference,
          overridden_by: actorId || null,
          overridden_at: now,
        }
      : null,
  };
}

function calendarCheck(preflight) {
  const row = preflight?.return || {};
  const taxCalendar = row?.metadata?.tax_calendar || {};
  const resolution = resolveFinanceTaxDeadline({
    jurisdictionCode: row.jurisdiction_code,
    formCode: taxCalendar.form_code || "PP30",
    filingChannel: taxCalendar.filing_channel || "ONLINE",
    periodEnd: row.period_end,
  });
  const recorded = clean(row.filing_due_date);
  const override = taxCalendar.override || null;
  const confirmation = taxCalendar.human_confirmation || null;
  const overrideValid = Boolean(
    override
    && clean(override.date) === recorded
    && clean(override.reason)
    && clean(override.evidence_reference)
  );
  const confirmationValid = Boolean(
    confirmation
    && clean(confirmation.reason)
    && clean(confirmation.evidence_reference)
  );

  if (overrideValid) {
    return {
      resolution,
      check: {
        code: "TAX_CALENDAR_AUTHORITY",
        label: "Filing deadline authority",
        status: "WARNING",
        detail: `Controlled human override to ${recorded}. ${clean(override.reason)} Evidence: ${clean(override.evidence_reference)}.`,
        count: 1,
        blocks_calculation: false,
        blocks_submission: false,
      },
    };
  }

  if (!resolution.supported) {
    if (confirmationValid && recorded) {
      return {
        resolution,
        check: {
          code: "TAX_CALENDAR_AUTHORITY",
          label: "Filing deadline authority",
          status: "WARNING",
          detail: `Deadline ${recorded} is human-confirmed because this jurisdiction is not yet automated. Evidence: ${clean(confirmation.evidence_reference)}.`,
          count: 1,
          blocks_calculation: false,
          blocks_submission: false,
        },
      };
    }
    return {
      resolution,
      check: {
        code: "TAX_CALENDAR_AUTHORITY",
        label: "Filing deadline authority",
        status: "BLOCK",
        detail: "This jurisdiction does not yet have an automated statutory calendar. Confirm the deadline with authority evidence before filing.",
        count: 1,
        blocks_calculation: false,
        blocks_submission: true,
      },
    };
  }

  if (!recorded || recorded !== resolution.statutory_due_date) {
    return {
      resolution,
      check: {
        code: "TAX_CALENDAR_AUTHORITY",
        label: "Filing deadline authority",
        status: "BLOCK",
        detail: `Recorded deadline ${recorded || "is missing"}; current governed policy resolves to ${resolution.statutory_due_date}. Refresh the filing calendar or record a controlled override with evidence.`,
        count: 1,
        blocks_calculation: false,
        blocks_submission: true,
      },
    };
  }

  if (resolution.verification_status !== "OFFICIAL_CALENDAR_VERIFIED" && !confirmationValid) {
    return {
      resolution,
      check: {
        code: "TAX_CALENDAR_AUTHORITY",
        label: "Filing deadline authority",
        status: "BLOCK",
        detail: `The rule-derived deadline is ${recorded}, but the official calendar for this due month is not yet verified. Confirm it with authority evidence before filing.`,
        count: 1,
        blocks_calculation: false,
        blocks_submission: true,
      },
    };
  }

  return {
    resolution,
    check: {
      code: "TAX_CALENDAR_AUTHORITY",
      label: "Filing deadline authority",
      status: confirmationValid ? "WARNING" : "PASS",
      detail: confirmationValid
        ? `Deadline ${recorded} matches governed policy and also carries human authority evidence: ${clean(confirmation.evidence_reference)}.`
        : `Deadline ${recorded} is verified against the official Thailand Revenue Department calendar for ${resolution.filing_channel_label}.`,
      count: confirmationValid ? 1 : 0,
      blocks_calculation: false,
      blocks_submission: false,
    },
  };
}

function legalDeadlineCheck(preflight, legalClock) {
  const row = preflight?.return || {};
  const dueDate = clean(row.filing_due_date);
  const status = upper(row.status);
  const overdue = Boolean(dueDate && legalClock?.legal_date && dueDate < legalClock.legal_date && status !== "SUBMITTED");
  return {
    check: {
      code: "FILING_DEADLINE",
      label: "Filing deadline",
      status: !dueDate || overdue ? "WARNING" : "PASS",
      detail: !dueDate
        ? "No filing due date is recorded. Add the governed statutory deadline so the work queue can prioritise it."
        : overdue
          ? `This return was due ${dueDate} in ${legalClock.time_zone}. Filing can continue, but it should be treated as overdue work.`
          : `Due ${dueDate} · evaluated on ${legalClock.legal_date} in ${legalClock.time_zone}.`,
      count: !dueDate || overdue ? 1 : 0,
      blocks_calculation: false,
      blocks_submission: false,
    },
    overdue,
  };
}

export function applyFinanceTaxCalendarToPreflight(preflight) {
  if (!preflight) return preflight;
  const { resolution, check } = calendarCheck(preflight);
  const legalClock = getFinanceTaxLegalClock({ jurisdictionCode: preflight?.return?.jurisdiction_code });
  const deadline = legalDeadlineCheck(preflight, legalClock);
  const checks = [
    check,
    ...(Array.isArray(preflight.checks)
      ? preflight.checks
          .filter(item => item?.code !== "TAX_CALENDAR_AUTHORITY" && item?.code !== "FILING_DEADLINE")
      : []),
    deadline.check,
  ];
  const existingSubmissionBlockers = Array.isArray(preflight.submission_blockers)
    ? preflight.submission_blockers.filter(item => item?.code !== "TAX_CALENDAR_AUTHORITY")
    : [];
  const submissionBlockers = check.blocks_submission
    ? [check, ...existingSubmissionBlockers]
    : existingSubmissionBlockers;
  const readyToSubmit = preflight.ready_to_submit === true && submissionBlockers.length === 0;
  const rowStatus = upper(preflight?.return?.status);
  let state = preflight.state;
  if (rowStatus !== "SUBMITTED" && check.blocks_submission && rowStatus === "CALCULATED") {
    state = "NEEDS_ATTENTION";
  } else if (rowStatus !== "SUBMITTED" && readyToSubmit) {
    state = "READY_TO_FILE";
  }

  return {
    ...preflight,
    state,
    ready_to_submit: readyToSubmit,
    checks,
    due: {
      ...(preflight.due || {}),
      filing_due_date: preflight?.return?.filing_due_date || preflight?.due?.filing_due_date || null,
      overdue: deadline.overdue,
      legal_date: legalClock.legal_date,
      legal_time_zone: legalClock.time_zone,
    },
    submission_blockers: submissionBlockers,
    tax_calendar: {
      resolution,
      legal_clock: legalClock,
      recorded_due_date: preflight?.return?.filing_due_date || null,
      metadata: preflight?.return?.metadata?.tax_calendar || null,
    },
  };
}

export const FINANCE_TAX_CALENDAR_POLICY_VERSION = POLICY_VERSION;