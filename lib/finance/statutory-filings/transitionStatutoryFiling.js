import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TRANSITIONS = Object.freeze({
  DRAFT: new Set(["IN_REVIEW"]),
  IN_REVIEW: new Set(["DRAFT", "SUBMITTED"]),
  SUBMITTED: new Set(["ACCEPTED", "REJECTED"]),
  REJECTED: new Set(["DRAFT"]),
  ACCEPTED: new Set(),
});

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
