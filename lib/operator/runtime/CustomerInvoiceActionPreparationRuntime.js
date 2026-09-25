import { listCustomers } from "@/lib/commercial/customers/CustomerService";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCustomerInvoiceDatePlan } from "./CustomerInvoiceDateIntentRuntime.mjs";

export const CUSTOMER_INVOICE_ACTION_PREPARATION_CONTRACT = "AVANTIQO_CUSTOMER_INVOICE_ACTION_PREPARATION_V1";

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function normalized(value) {
  return text(value, 12000).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u0e00-\u0e7f]+/g, " ").replace(/\s+/g, " ").trim();
}
function todayIso(timezone = "Asia/Bangkok") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function dateFromDayOffset(baseIso, offset) {
  const date = new Date(`${baseIso}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10);
}
const WEEKDAY = new Map([["sunday",0],["monday",1],["tuesday",2],["wednesday",3],["thursday",4],["friday",5],["saturday",6]]);
function nextWeekday(baseIso, target) {
  const base = new Date(`${baseIso}T12:00:00Z`); let delta=(target-base.getUTCDay()+7)%7; if(delta===0) delta=7; return dateFromDayOffset(baseIso, delta);
}
function serviceDatesFromMessage(message, timezone, expected = 2) {
  const source=text(message,12000); const today=todayIso(timezone); const dates=[];
  for (const hit of source.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)) dates.push(hit[1]);
  if (!dates.length) {
    for (const hit of source.toLowerCase().matchAll(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)) {
      const weekday=WEEKDAY.get(hit[1]); if(weekday!==undefined) dates.push(nextWeekday(today, weekday));
    }
  }
  return [...new Set(dates)].slice(0, Math.max(1, expected));
}
function replaceLineDate(description, isoDate) {
  const source=text(description,1000); if(!source || !isoDate) return source;
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(source)) return source.replace(/\b20\d{2}-\d{2}-\d{2}\b/, isoDate);
  const d=new Date(`${isoDate}T12:00:00Z`); const human=new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d);
  if (/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*20\d{2}\b/i.test(source)) return source.replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*20\d{2}\b/i,human);
  return `${source} — ${isoDate}`;
}
function moneyFromMessage(message) {
  const source=text(message).replace(/,/g,""); const match=source.match(/(?:thb|baht|฿)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:thb|baht|฿)/i); return match ? Number(match[1]||match[2]) : null;
}
function currencyFromMessage(message) {
  if (/\b(?:thb|baht)\b|฿/i.test(text(message))) return "THB"; const match=text(message).match(/\b(USD|EUR|GBP|SEK|NOK|DKK|SGD|AUD|JPY|CNY|HKD)\b/i); return match?.[1]?.toUpperCase() || null;
}
function copyIntent(message) { return /\b(copy|duplicate|clone|same as|based on)\b/i.test(text(message)) && /\binvoice\b/i.test(text(message)); }
function customerNames(customer) { return [customer?.display_name,customer?.customer_name,customer?.legal_name,customer?.name].map((v)=>text(v,240)).filter(Boolean); }
async function resolveMentionedCustomer({organizationId,message}) {
  const customers=await listCustomers({organizationId,limit:500}); const hay=` ${normalized(message)} `; const matches=[];
  for (const customer of customers) for (const name of customerNames(customer)) { const key=normalized(name); if(key.length>=2 && hay.includes(` ${key} `)) matches.push({customer,name,key}); }
  if(!matches.length) return {customer:null,ambiguous:false}; matches.sort((a,b)=>b.key.length-a.key.length); const longest=matches[0].key.length; const ids=[...new Set(matches.filter(m=>m.key.length===longest).map(m=>String(m.customer.party_id||m.customer.id)))];
  return ids.length===1 ? {customer:matches.find(m=>String(m.customer.party_id||m.customer.id)===ids[0]).customer,ambiguous:false} : {customer:null,ambiguous:true};
}
async function latestInvoiceWithLines({organizationId,entityId,partyId}) {
  let q=supabaseAdmin.from("customer_invoices").select("*").eq("organization_id",organizationId).eq("party_id",partyId); if(entityId) q=q.eq("entity_id",entityId);
  const ir=await q.order("invoice_date",{ascending:false}).order("created_at",{ascending:false}).limit(1); if(ir.error) throw ir.error; const invoice=ir.data?.[0]||null; if(!invoice) return null;
  const lr=await supabaseAdmin.from("customer_invoice_lines").select("*").eq("organization_id",organizationId).eq("customer_invoice_id",invoice.id).order("created_at",{ascending:true}); if(lr.error) throw lr.error;
  return {...invoice,lines:lr.data||[]};
}

function humanDate(isoDate) {
  if (!isoDate) return "not set";
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function invoiceConfirmationSummary({ customerName, sourceInvoiceNumber = null, payload }) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  const currency = payload?.currency_code || "THB";
  const total = lines.reduce((sum, line) => sum + Number(line?.line_total ?? ((Number(line?.quantity || 1) * Number(line?.unit_price || 0)) || 0)), 0);
  const lineText = lines.map((line) => {
    const description = text(line?.description, 500).replace(/\s+[—-]\s+(20\d{2}-\d{2}-\d{2})$/, (_, iso) => ` — ${humanDate(iso)}`);
    const amount = Number(line?.line_total ?? ((Number(line?.quantity || 1) * Number(line?.unit_price || 0)) || 0));
    return `${description} — ${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }).join("\n");
  const opening = sourceInvoiceNumber
    ? `I found ${customerName}'s latest invoice and copied it.`
    : `I prepared a new invoice for ${customerName}.`;
  return `${opening}\n\n${lineText}\n\nInvoice date and due date: ${humanDate(payload?.invoice_date)}\nTotal: ${currency} ${total.toLocaleString("en-US", { maximumFractionDigits: 2 })}.`;
}

function stagedInvoiceIdempotencyKey() {
  return `business-partner-customer-invoice:${randomUUID()}`;
}
function copiedLine(line,date) { return { description:date?replaceLineDate(line.description,date):text(line.description,1000), quantity:Number(line.quantity||1), unit_price:Number(line.unit_price||line.line_total||0), line_total:Number(line.line_total||Number(line.quantity||1)*Number(line.unit_price||0)), ...(line.tax_code?{tax_code:line.tax_code}:{}), ...(line.tax_rate!=null?{tax_rate:line.tax_rate}:{}), ...(line.revenue_account_id?{revenue_account_id:line.revenue_account_id}:{}), ...(line.cost_center_id?{cost_center_id:line.cost_center_id}:{}), ...(line.department_id?{department_id:line.department_id}:{}), ...(line.project_id?{project_id:line.project_id}:{}) }; }
export async function prepareCustomerInvoiceAction({organizationId,entityId=null,message,timezone="Asia/Bangkok"}={}) {
  const resolved=await resolveMentionedCustomer({organizationId,message}); if(resolved.ambiguous) return {clarification_required:true,question:"I matched more than one current customer in that request. Which customer do you mean?"};
  const customer=resolved.customer; if(!customer) return null; const partyId=customer.party_id||customer.id; const customerName=customer.display_name||customer.customer_name||customer.name||customer.legal_name||"the selected customer"; const today=todayIso(timezone);
  if(copyIntent(message)) {
    const source=await latestInvoiceWithLines({organizationId,entityId,partyId}); if(!source) return {clarification_required:true,question:`I found ${customerName}, but there is no current customer invoice to copy.`}; if(!source.lines?.length) return {clarification_required:true,question:`The latest invoice for ${customerName} has no invoice lines to copy.`};
    const datePlan=resolveCustomerInvoiceDatePlan({message,timezone,fallbackInvoiceDate:source.invoice_date||today,fallbackDueDate:source.due_date||source.invoice_date||today,expectedLines:source.lines.length});
    const invoiceDate=/\b(?:today'?s?|today)\b[\s\S]{0,30}\binvoice\s+date\b|\binvoice\s+date[\s\S]{0,20}\btoday\b/i.test(message)?today:datePlan.invoice_date;
    const dueDate=/\bdue\s+date[\s\S]{0,20}\btoday\b|\btoday'?s?[\s\S]{0,30}\bdue\s+date\b/i.test(message)?today:datePlan.due_date;
    const dates=datePlan.service_dates.length ? datePlan.service_dates : serviceDatesFromMessage(message,timezone,source.lines.length);
    const lines=source.lines.map((line,index)=>copiedLine(line,dates[index]||null));
    const payload={party_id:partyId,invoice_date:invoiceDate,due_date:dueDate,currency_code:source.currency_code||"THB",exchange_rate:Number(source.exchange_rate||1),idempotency_key:stagedInvoiceIdempotencyKey(),lines};
    return {clarification_required:false,payload,resolved_entities:{customer_party_id:partyId,customer_name:customerName,source_invoice_id:source.id,source_invoice_number:source.invoice_number||null},summary:invoiceConfirmationSummary({customerName,sourceInvoiceNumber:source.invoice_number||null,payload})};
  }
  const amount=moneyFromMessage(message); if(!Number.isFinite(amount)||amount<=0) return {clarification_required:true,question:`I found ${customerName}. What should I invoice them for? Give me the line description and amount, or tell me which previous invoice to copy.`};
  const description=text(message.match(/(?:line|for)\s*:\s*(.+)$/i)?.[1],800)||"Customer invoice";
  const payload={party_id:partyId,invoice_date:today,due_date:today,currency_code:currencyFromMessage(message)||"THB",exchange_rate:1,idempotency_key:stagedInvoiceIdempotencyKey(),lines:[{description,quantity:1,unit_price:amount,line_total:amount}]};
  return {clarification_required:false,payload,resolved_entities:{customer_party_id:partyId,customer_name:customerName},summary:invoiceConfirmationSummary({customerName,payload})};
}

function dayNumberDatesFromMessage(message, baseIso, expected) {
  const source = text(message, 1000);
  if (/(?:thb|baht|usd|eur|gbp|sek|nok|dkk|sgd|aud|jpy|cny|hkd|฿)/i.test(source)) return [];
  const values = [...source.matchAll(/\b([1-9]|[12]\d|3[01])\b/g)].map((match) => Number(match[1]));
  if (!values.length || values.length > Math.max(expected + 2, 6)) return [];
  const [year, month] = String(baseIso || "").split("-").map(Number);
  if (!year || !month) return [];
  const dates = [];
  for (const day of values.slice(0, expected)) {
    const candidate = `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const check = new Date(`${candidate}T12:00:00Z`);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return [];
    dates.push(candidate);
  }
  return dates;
}

export function revisePendingCustomerInvoicePayload({ payload = {}, message, timezone = "Asia/Bangkok", reason = null } = {}) {
  const current = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const lines = Array.isArray(current.lines) ? current.lines : [];
  if (!lines.length) return null;
  const baseDate = text(current.invoice_date, 20) || todayIso(timezone);
  let dates = serviceDatesFromMessage(message, timezone, lines.length);
  if (!dates.length) dates = dayNumberDatesFromMessage(message, baseDate, lines.length);
  if (!dates.length) return null;
  const nextLines = lines.map((line, index) => ({
    ...line,
    ...(dates[index] ? { description: replaceLineDate(line?.description, dates[index]) } : {}),
  }));
  const changed = nextLines.some((line, index) => text(line.description, 1000) !== text(lines[index]?.description, 1000));
  if (!changed) return null;
  return {
    payload: { ...current, lines: nextLines },
    dates,
    summary: invoiceConfirmationSummary({
      customerName: text(reason, 500).match(/for\s+(.+?)\.?$/i)?.[1] || "the selected customer",
      payload: { ...current, lines: nextLines },
    }).replace(/^I prepared a new invoice for /, "I updated the invoice for "),
  };
}
