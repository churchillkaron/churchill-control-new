import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function escapeHtml(value) { return text(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function money(value, currency) { const n=Number(value||0); return `${escapeHtml(currency||"THB")} ${n.toLocaleString("en-US",{maximumFractionDigits:2})}`; }

export async function GET(request) {
  const url = new URL(request.url);
  const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
  const conversationId = text(url.searchParams.get("conversationId") || url.searchParams.get("conversation_id"));
  if (!organizationId || !conversationId) return new Response("Preview scope required", { status: 400 });
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return new Response("Unauthorized", { status: access.status || 403 });
  const partyId = text(access.staff?.party_id || access.staff?.partyId);
  if (!partyId) return new Response("Staff party required", { status: 403 });
  const { data, error } = await supabaseAdmin.from("intelligence_conversations")
    .select("agreement_state")
    .eq("organization_id", access.organizationId || organizationId)
    .eq("party_id", partyId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data) return new Response("Conversation not found", { status: 404 });
  const pending = object(object(data.agreement_state).pending_execution);
  if (text(pending.capability_key) !== "finance.accounts_receivable.CreateCustomerInvoice") return new Response("No staged invoice", { status: 404 });
  const payload = object(pending.payload);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const currency = text(payload.currency_code) || "THB";
  const total = lines.reduce((sum,line)=>sum+Number(line.line_total ?? ((Number(line.quantity||0)*Number(line.unit_price||0)) || 0)),0);
  const lineRows = lines.map((line)=>`<tr><td>${escapeHtml(line.description || "Invoice line")}</td><td>${escapeHtml(line.quantity ?? 1)}</td><td>${money(line.unit_price, currency)}</td><td>${money(line.line_total ?? (Number(line.quantity||0)*Number(line.unit_price||0)), currency)}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice preview</title><style>body{margin:0;background:#fff;color:#202020;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.page{max-width:900px;margin:0 auto;padding:48px}.top{display:flex;justify-content:space-between;gap:30px;border-bottom:1px solid #ddd;padding-bottom:24px}.draft{font-size:12px;letter-spacing:.2em;color:#9a6c32}.title{font-size:34px;font-weight:600;margin-top:6px}.meta{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:12px 30px}.meta div{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:8px 0}table{width:100%;border-collapse:collapse;margin-top:34px}th,td{padding:12px 8px;border-bottom:1px solid #e5e5e5;text-align:right}th:first-child,td:first-child{text-align:left}.total{margin-top:24px;margin-left:auto;width:320px;display:flex;justify-content:space-between;font-size:19px;font-weight:600}.note{margin-top:38px;padding:14px 16px;background:#faf6ef;border:1px solid #ead8bc;border-radius:10px;color:#71522d}</style></head><body><div class="page"><div class="top"><div><div class="draft">STAGED PREVIEW</div><div class="title">Customer Invoice</div></div><div style="text-align:right">Nothing has been created yet.</div></div><div class="meta"><div><span>Invoice date</span><strong>${escapeHtml(payload.invoice_date)}</strong></div><div><span>Due date</span><strong>${escapeHtml(payload.due_date)}</strong></div><div><span>Currency</span><strong>${escapeHtml(currency)}</strong></div><div><span>Status</span><strong>Draft preview</strong></div></div><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${lineRows}</tbody></table><div class="total"><span>Total</span><span>${money(total,currency)}</span></div><div class="note">This preview is generated from the exact staged Business Partner action. Creating the invoice still requires your explicit confirmation.</div></div></body></html>`;
  return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}
