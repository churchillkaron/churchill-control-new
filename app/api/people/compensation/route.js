export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
  "ACCOUNTING_ADMIN",
]);

const SALARY_TYPES = new Set(["MONTHLY", "HOURLY"]);
const PAYROLL_FREQUENCIES = new Set(["MONTHLY", "WEEKLY", "BIWEEKLY"]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function contextResponse(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
      code: context.code,
      availableOrganizationIds: context.availableOrganizationIds || [],
    },
    { status: context.status || 403 }
  );
}

async function context(request) {
  const resolved = await resolveAuthenticatedStaffContext({ request });

  if (!resolved.success) {
    return { response: contextResponse(resolved) };
  }

  const role = normalizeRole(resolved.role || resolved.staff?.role);

  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Compensation management permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    staff: resolved.staff,
    role,
    organizationId: resolved.organizationId,
  };
}

async function resolveEntity({ organizationId, requestedEntityId = null }) {
  let query = supabaseAdmin
    .from("legal_entities")
    .select("id,legal_name,display_name,code,country,currency,is_default_accounting_entity")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (requestedEntityId) {
    query = query.eq("id", requestedEntityId);
  } else {
    query = query.eq("is_default_accounting_entity", true).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadEmployee({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,role,position,department,party_id,active")
    .eq("id", staffId)
    .eq("active_organization_id", organizationId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function optionalText(body, key, { uppercase = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, key)) return undefined;
  const value = String(body?.[key] ?? "").trim();
  return uppercase ? value.toUpperCase() : value;
}

function optionalNumber(body, key) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, key)) return undefined;
  const raw = body?.[key];
  if (raw === "" || raw === null || typeof raw === "undefined") return 0;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }
  return value;
}

function validateCompensationInput({
  salaryType,
  payrollFrequency,
  currency,
  monthlySalary,
  hourlyRate,
  requireComplete = false,
}) {
  if (salaryType !== undefined && !SALARY_TYPES.has(salaryType)) {
    throw new Error("salaryType must be MONTHLY or HOURLY");
  }

  if (
    payrollFrequency !== undefined &&
    !PAYROLL_FREQUENCIES.has(payrollFrequency)
  ) {
    throw new Error("payrollFrequency must be MONTHLY, WEEKLY or BIWEEKLY");
  }

  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
    throw new Error("currency must be a 3-letter code");
  }

  if (requireComplete) {
    if (!SALARY_TYPES.has(salaryType)) throw new Error("salaryType required");
    if (!PAYROLL_FREQUENCIES.has(payrollFrequency)) {
      throw new Error("payrollFrequency required");
    }
    if (!/^[A-Z]{3}$/.test(currency || "")) {
      throw new Error("currency must be a 3-letter code");
    }
  }

  const monthly = Number(monthlySalary || 0);
  const hourly = Number(hourlyRate || 0);

  if (salaryType === "MONTHLY" && monthly <= 0) {
    throw new Error("monthlySalary must be greater than zero for monthly pay");
  }
  if (salaryType === "HOURLY" && hourly <= 0) {
    throw new Error("hourlyRate must be greater than zero for hourly pay");
  }
}

function readPayload(body) {
  return {
    staffId: String(body?.staffId || "").trim(),
    entityId: String(body?.entityId || "").trim() || null,
    effectiveFrom: String(body?.effectiveFrom || "").trim() || null,
    bankName: optionalText(body, "bankName"),
    bankAccount: optionalText(body, "bankAccount"),
    salaryType: optionalText(body, "salaryType", { uppercase: true }),
    payrollFrequency: optionalText(body, "payrollFrequency", { uppercase: true }),
    currency: optionalText(body, "currency", { uppercase: true }),
    monthlySalary: optionalNumber(body, "monthlySalary"),
    hourlyRate: optionalNumber(body, "hourlyRate"),
  };
}

export async function GET(request) {
  try {
    const ctx = await context(request);
    if (ctx.response) return ctx.response;

    const url = new URL(request.url);
    const requestedEntityId = url.searchParams.get("entityId") || null;
    const entity = await resolveEntity({
      organizationId: ctx.organizationId,
      requestedEntityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Payroll legal entity not configured" },
        { status: 409 }
      );
    }

    const date = today();
    const [staffResult, profileResult] = await Promise.all([
      supabaseAdmin
        .from("staff_accounts")
        .select("id,name,email,role,position,department,party_id,active")
        .eq("active_organization_id", ctx.organizationId)
        .eq("active", true)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("employee_compensation_profiles")
        .select("*")
        .eq("organization_id", ctx.organizationId)
        .eq("entity_id", entity.id)
        .lte("effective_from", date)
        .or(`effective_to.is.null,effective_to.gte.${date}`)
        .order("effective_from", { ascending: false }),
    ]);

    if (staffResult.error) throw staffResult.error;
    if (profileResult.error) throw profileResult.error;

    const profileByStaff = new Map();
    for (const profile of profileResult.data || []) {
      if (!profileByStaff.has(profile.staff_account_id)) {
        profileByStaff.set(profile.staff_account_id, profile);
      }
    }

    const employees = (staffResult.data || []).map((employee) => ({
      ...employee,
      compensation: profileByStaff.get(employee.id) || null,
    }));

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      role: ctx.role,
      entity,
      employees,
    });
  } catch (error) {
    console.error("COMPENSATION_LIST_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load compensation profiles" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const ctx = await context(request);
    if (ctx.response) return ctx.response;

    const body = await request.json();
    const payload = readPayload(body);

    if (!payload.staffId) {
      return NextResponse.json(
        { success: false, error: "staffId required" },
        { status: 400 }
      );
    }

    validateCompensationInput({ ...payload, requireComplete: true });

    const effectiveFrom = payload.effectiveFrom || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return NextResponse.json(
        { success: false, error: "effectiveFrom must use YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    const [employee, entity] = await Promise.all([
      loadEmployee({ organizationId: ctx.organizationId, staffId: payload.staffId }),
      resolveEntity({
        organizationId: ctx.organizationId,
        requestedEntityId: payload.entityId,
      }),
    ]);

    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found in this organization" },
        { status: 404 }
      );
    }
    if (!employee.party_id) {
      return NextResponse.json(
        { success: false, error: "Employee Party identity is not configured" },
        { status: 409 }
      );
    }
    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Payroll legal entity not configured" },
        { status: 409 }
      );
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("employee_compensation_profiles")
      .select("id,effective_from,effective_to")
      .eq("organization_id", ctx.organizationId)
      .eq("entity_id", entity.id)
      .eq("staff_account_id", payload.staffId)
      .or(`effective_to.is.null,effective_to.gte.${effectiveFrom}`)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A compensation profile already overlaps this effective date for the employee and legal entity" },
        { status: 409 }
      );
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from("employee_compensation_profiles")
      .insert({
        organization_id: ctx.organizationId,
        entity_id: entity.id,
        party_id: employee.party_id,
        staff_account_id: employee.id,
        effective_from: effectiveFrom,
        salary_type: payload.salaryType,
        payroll_frequency: payload.payrollFrequency,
        currency: payload.currency,
        monthly_salary: payload.salaryType === "MONTHLY" ? payload.monthlySalary : 0,
        hourly_rate: payload.salaryType === "HOURLY" ? payload.hourlyRate : 0,
        bank_name: payload.bankName || null,
        bank_account: payload.bankAccount || null,
      })
      .select("*")
      .single();

    if (createError) throw createError;

    return NextResponse.json({ success: true, compensation: created }, { status: 201 });
  } catch (error) {
    console.error("COMPENSATION_CREATE_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to create compensation profile" },
      { status: 400 }
    );
  }
}

export async function PATCH(request) {
  try {
    const ctx = await context(request);
    if (ctx.response) return ctx.response;

    const body = await request.json();
    const payload = readPayload(body);

    if (!payload.staffId) {
      return NextResponse.json(
        { success: false, error: "staffId required" },
        { status: 400 }
      );
    }

    validateCompensationInput(payload);

    const updates = {};
    if (payload.bankName !== undefined) updates.bank_name = payload.bankName || null;
    if (payload.bankAccount !== undefined) updates.bank_account = payload.bankAccount || null;
    if (payload.salaryType !== undefined) updates.salary_type = payload.salaryType;
    if (payload.payrollFrequency !== undefined) updates.payroll_frequency = payload.payrollFrequency;
    if (payload.currency !== undefined) updates.currency = payload.currency;
    if (payload.monthlySalary !== undefined) updates.monthly_salary = payload.monthlySalary;
    if (payload.hourlyRate !== undefined) updates.hourly_rate = payload.hourlyRate;

    if (!Object.keys(updates).length) {
      return NextResponse.json(
        { success: false, error: "No compensation changes supplied" },
        { status: 400 }
      );
    }

    const [employee, entity] = await Promise.all([
      loadEmployee({ organizationId: ctx.organizationId, staffId: payload.staffId }),
      resolveEntity({
        organizationId: ctx.organizationId,
        requestedEntityId: payload.entityId,
      }),
    ]);

    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found in this organization" },
        { status: 404 }
      );
    }
    if (!employee.party_id) {
      return NextResponse.json(
        { success: false, error: "Employee Party identity is not configured" },
        { status: 409 }
      );
    }
    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Payroll legal entity not configured" },
        { status: 409 }
      );
    }

    const date = today();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("employee_compensation_profiles")
      .select("id,organization_id,entity_id,party_id,staff_account_id,salary_type,monthly_salary,hourly_rate")
      .eq("organization_id", ctx.organizationId)
      .eq("entity_id", entity.id)
      .eq("staff_account_id", payload.staffId)
      .lte("effective_from", date)
      .or(`effective_to.is.null,effective_to.gte.${date}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Active compensation profile not found" },
        { status: 404 }
      );
    }
    if (profile.party_id !== employee.party_id) {
      return NextResponse.json(
        { success: false, error: "Compensation Party identity does not match employee" },
        { status: 409 }
      );
    }

    const effectiveSalaryType = payload.salaryType || profile.salary_type;
    validateCompensationInput({
      salaryType: effectiveSalaryType,
      payrollFrequency: payload.payrollFrequency,
      currency: payload.currency,
      monthlySalary: payload.monthlySalary ?? profile.monthly_salary,
      hourlyRate: payload.hourlyRate ?? profile.hourly_rate,
    });

    if (payload.salaryType === "MONTHLY" && payload.hourlyRate === undefined) {
      updates.hourly_rate = 0;
    }
    if (payload.salaryType === "HOURLY" && payload.monthlySalary === undefined) {
      updates.monthly_salary = 0;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("employee_compensation_profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", profile.id)
      .eq("organization_id", ctx.organizationId)
      .eq("entity_id", entity.id)
      .eq("party_id", employee.party_id)
      .eq("staff_account_id", payload.staffId)
      .select("*")
      .single();

    if (updateError) throw updateError;
    return NextResponse.json({ success: true, compensation: updated });
  } catch (error) {
    console.error("COMPENSATION_UPDATE_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update compensation profile" },
      { status: 400 }
    );
  }
}
