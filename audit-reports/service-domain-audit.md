# Avantiqo Service Domain Convergence Audit

Generated: 2026-07-10T04:04:14.575Z

## Required flow

```
UBTE
  -> Service Capability
  -> Service Runtime
  -> Provider Resolver
  -> Usage Control
  -> Pricing
  -> Wallet
  -> Billing
  -> Finance
```

## Required identity

- `organization_id`: always
- `party_id`: attributable usage
- `entity_id`: wallet, billing, finance and legal ownership

## Summary

- Files scanned: 2323
- Errors: 1157
- Warnings: 4
- Strict mode: no

## Findings

| Severity | Rule | Location | Message | Evidence |
|---|---|---|---|---|
| ERROR | NO_TENANT | app/(mobile)/executive/page.jsx:30 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/(system)/analytics/live/page.jsx:52 | Legacy tenant context found. Use organization_id and entity_id where required. | data?.tenant_id |
| ERROR | NO_TENANT | app/(system)/analytics/live/page.jsx:56 | Legacy tenant context found. Use organization_id and entity_id where required. | data.tenant_id |
| ERROR | NO_TENANT | app/(system)/analytics/live/page.jsx:17 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/analytics/live/page.jsx:68 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/analytics/live/page.jsx:74 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(system)/analytics/live/page.jsx:85 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/analytics/live/page.jsx:91 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/analytics/live/page.jsx:120 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/analytics/revenue/page.jsx:26 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/(system)/analytics/sales/page.jsx:60 | Legacy tenant context found. Use organization_id and entity_id where required. | data?.tenant_id |
| ERROR | NO_TENANT | app/(system)/analytics/sales/page.jsx:64 | Legacy tenant context found. Use organization_id and entity_id where required. | data.tenant_id |
| ERROR | NO_TENANT | app/(system)/analytics/sales/page.jsx:25 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/analytics/sales/page.jsx:76 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/analytics/sales/page.jsx:82 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(system)/analytics/sales/page.jsx:95 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/analytics/sales/page.jsx:101 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/analytics/sales/page.jsx:130 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/automation/approvals-center/page.jsx:17 | Legacy tenant context found. Use organization_id and entity_id where required. | `/api/approval_requests?tenantId=${TENANT_ID}&status=pending` |
| ERROR | NO_TENANT | app/(system)/automation/live/page.jsx:59 | Legacy tenant context found. Use organization_id and entity_id where required. | data?.tenant_id |
| ERROR | NO_TENANT | app/(system)/automation/live/page.jsx:63 | Legacy tenant context found. Use organization_id and entity_id where required. | data.tenant_id |
| ERROR | NO_TENANT | app/(system)/automation/live/page.jsx:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/automation/live/page.jsx:75 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/automation/live/page.jsx:81 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(system)/automation/live/page.jsx:92 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/automation/live/page.jsx:98 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/automation/live/page.jsx:106 | Legacy tenant context found. Use organization_id and entity_id where required. | `workflow-runtime-${tenantId}`, |
| ERROR | NO_TENANT | app/(system)/automation/live/page.jsx:132 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/components/marketing/studio/AssetUploadPanel.jsx:9 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/components/marketing/studio/AssetUploadPanel.jsx:106 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenantId", |
| ERROR | NO_TENANT | app/(system)/components/marketing/studio/AssetUploadPanel.jsx:107 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(system)/history/page.jsx:42 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/(system)/history/page.jsx:96 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id" |
| ERROR | NO_TENANT | app/(system)/history/page.jsx:105 | Legacy tenant context found. Use organization_id and entity_id where required. | !data?.tenant_id |
| ERROR | NO_TENANT | app/(system)/history/page.jsx:111 | Legacy tenant context found. Use organization_id and entity_id where required. | data.tenant_id |
| ERROR | NO_TENANT | app/(system)/history/page.jsx:14 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/history/page.jsx:31 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/history/page.jsx:43 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(system)/history/page.jsx:122 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/history/page.jsx:128 | Legacy tenant context found. Use organization_id and entity_id where required. | }, [tenantId]); |
| ERROR | NO_TENANT | app/(system)/monitoring/live/page.jsx:56 | Legacy tenant context found. Use organization_id and entity_id where required. | data?.tenant_id |
| ERROR | NO_TENANT | app/(system)/monitoring/live/page.jsx:60 | Legacy tenant context found. Use organization_id and entity_id where required. | data.tenant_id |
| ERROR | NO_TENANT | app/(system)/monitoring/live/page.jsx:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/monitoring/live/page.jsx:72 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/monitoring/live/page.jsx:78 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(system)/monitoring/live/page.jsx:89 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/monitoring/live/page.jsx:95 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/monitoring/live/page.jsx:103 | Legacy tenant context found. Use organization_id and entity_id where required. | `monitoring-live-${tenantId}`, |
| ERROR | NO_TENANT | app/(system)/monitoring/live/page.jsx:139 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/payroll/live/page.jsx:52 | Legacy tenant context found. Use organization_id and entity_id where required. | data?.tenant_id |
| ERROR | NO_TENANT | app/(system)/payroll/live/page.jsx:56 | Legacy tenant context found. Use organization_id and entity_id where required. | data.tenant_id |
| ERROR | NO_TENANT | app/(system)/payroll/live/page.jsx:17 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/payroll/live/page.jsx:68 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/payroll/live/page.jsx:74 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(system)/payroll/live/page.jsx:87 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/payroll/live/page.jsx:93 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/payroll/live/page.jsx:122 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/payroll/page.jsx:26 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", activeTenantId) |
| ERROR | NO_TENANT | app/(system)/payroll/page.jsx:13 | Legacy tenant context found. Use organization_id and entity_id where required. | const [tenantId, setTenantId] = useState(null); |
| ERROR | NO_TENANT | app/(system)/payroll/page.jsx:69 | Legacy tenant context found. Use organization_id and entity_id where required. | body: JSON.stringify({ tenantId, payrollMonth: "2026-06" }), |
| ERROR | NO_TENANT | app/(system)/settings/dishes/page.jsx:65 | Legacy tenant context found. Use organization_id and entity_id where required. | data?.tenant_id |
| ERROR | NO_TENANT | app/(system)/settings/dishes/page.jsx:69 | Legacy tenant context found. Use organization_id and entity_id where required. | data.tenant_id |
| ERROR | NO_TENANT | app/(system)/settings/dishes/page.jsx:92 | Legacy tenant context found. Use organization_id and entity_id where required. | `/api/dishes?tenant_id=${tenantId}` |
| ERROR | NO_TENANT | app/(system)/settings/dishes/page.jsx:120 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/(system)/settings/dishes/page.jsx:17 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/dishes/page.jsx:82 | Legacy tenant context found. Use organization_id and entity_id where required. | }, [tenantId]) |
| ERROR | NO_TENANT | app/(system)/settings/dishes/page.jsx:86 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/settings/dishes/page.jsx:92 | Legacy tenant context found. Use organization_id and entity_id where required. | `/api/dishes?tenant_id=${tenantId}` |
| ERROR | NO_TENANT | app/(system)/settings/dishes/page.jsx:121 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/kitchen/page.jsx:19 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/(system)/settings/kitchen/page.jsx:45 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/(system)/settings/kitchen/page.jsx:46 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/kitchen/page.jsx:74 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/(system)/settings/kitchen/page.jsx:75 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/marketing/page.jsx:23 | Legacy tenant context found. Use organization_id and entity_id where required. | organization?.tenant_id \|\| |
| ERROR | NO_TENANT | app/(system)/settings/marketing/page.jsx:22 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/(system)/settings/marketing/page.jsx:73 | Legacy tenant context found. Use organization_id and entity_id where required. | !tenantId \|\| |
| ERROR | NO_TENANT | app/(system)/settings/marketing/page.jsx:82 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/marketing/page.jsx:100 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/marketing/page.jsx:146 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/service-charge/page.jsx:72 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/(system)/settings/service-charge/page.jsx:102 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/(system)/settings/service-charge/page.jsx:22 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/(system)/settings/service-charge/page.jsx:73 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(system)/settings/service-charge/page.jsx:103 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/system/page.jsx:36 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/(system)/settings/system/page.jsx:47 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/system/page.jsx:19 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/(system)/settings/system/page.jsx:36 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/(system)/settings/system/page.jsx:47 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/tables/page.jsx:19 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/(system)/settings/tables/page.jsx:45 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/(system)/settings/tables/page.jsx:46 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/tables/page.jsx:74 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/(system)/settings/tables/page.jsx:75 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:61 | Legacy tenant context found. Use organization_id and entity_id where required. | loadUsers(userData.tenant_id); |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:64 | Legacy tenant context found. Use organization_id and entity_id where required. | async function loadUsers(tenant_id) { |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:68 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:68 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:83 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!currentUser?.tenant_id) { |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:113 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: currentUser.tenant_id, |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:113 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: currentUser.tenant_id, |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:138 | Legacy tenant context found. Use organization_id and entity_id where required. | loadUsers(currentUser.tenant_id); |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:159 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: currentUser.tenant_id, |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:159 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: currentUser.tenant_id, |
| ERROR | NO_TENANT | app/(system)/settings/users/page.jsx:183 | Legacy tenant context found. Use organization_id and entity_id where required. | loadUsers(currentUser.tenant_id); |
| ERROR | NO_TENANT | app/(system)/timeline/page.jsx:13 | Legacy tenant context found. Use organization_id and entity_id where required. | const res = await fetch("/api/timeline?tenantId=cbdc9308-5515-4d38-8e64-edae68dd5872"); |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/commercial/customers/page.jsx:15 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = businessContext?.organization?.id; |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/commercial/customers/page.jsx:30 | Legacy tenant context found. Use organization_id and entity_id where required. | body: JSON.stringify({ tenantId, customerPhone: customer.customer_phone }) |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/commercial/customers/page.jsx:38 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) return; |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/commercial/customers/page.jsx:44 | Legacy tenant context found. Use organization_id and entity_id where required. | body: JSON.stringify({ tenantId, query: search }) |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/commercial/customers/page.jsx:54 | Legacy tenant context found. Use organization_id and entity_id where required. | useEffect(() => { searchCustomers(""); }, [tenantId]); |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/commercial/customers/page.jsx:63 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/operations/kitchen/expo/ack_patch.js:1 | Legacy tenant context found. Use organization_id and entity_id where required. | export async function acknowledgeOrder({ orderId, tenantId }) { |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/operations/kitchen/expo/ack_patch.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/operations/kitchen/expo/page.jsx:71 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/operations/kitchen/expo/page.jsx:32 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/operations/kitchen/expo/page.jsx:50 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/operations/kitchen/expo/page.jsx:72 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/operations/kitchen/expo/page.jsx:102 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/(system)/workspace/[organizationId]/operations/kitchen/expo/page.jsx:133 | Legacy tenant context found. Use organization_id and entity_id where required. | }, [tenantId]); |
| ERROR | NO_TENANT | app/(workforce)/workforce/page.jsx:65 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: staff.tenant_id, |
| ERROR | NO_TENANT | app/(workforce)/workforce/page.jsx:88 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: staff.tenant_id, |
| ERROR | NO_TENANT | app/(workforce)/workforce/page.jsx:65 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: staff.tenant_id, |
| ERROR | NO_TENANT | app/(workforce)/workforce/page.jsx:88 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: staff.tenant_id, |
| ERROR | NO_TENANT | app/(workforce)/workforce/upload/page.jsx:10 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/(workforce)/workforce/upload/page.jsx:49 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenantId", |
| ERROR | NO_TENANT | app/(workforce)/workforce/upload/page.jsx:50 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/(workforce)/workforce/upload/page.jsx:89 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/(workforce)/workforce/upload/page.jsx:90 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/ai/business-profile/route.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/api/ai/business-profile/route.js:22 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenantId" |
| ERROR | NO_TENANT | app/api/ai/business-profile/route.js:25 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/ai/business-profile/route.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenantId required", |
| ERROR | NO_TENANT | app/api/ai/business-profile/route.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/approval_requests/route.js:36 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | app/api/approval_requests/route.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = searchParams.get("tenantId"); |
| ERROR | NO_TENANT | app/api/approval_requests/route.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = searchParams.get("tenantId"); |
| ERROR | NO_TENANT | app/api/approval_requests/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/approval_requests/route.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | error: "tenantId required", |
| ERROR | NO_TENANT | app/api/approval_requests/route.js:36 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | app/api/approvals/process/route.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: body.tenantId, // tenantId is optional; can be derived from workflowRequest |
| ERROR | NO_TENANT | app/api/approvals/process/route.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: body.tenantId, // tenantId is optional; can be derived from workflowRequest |
| ERROR | NO_TENANT | app/api/approvals/process/route.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: body.tenantId, // tenantId is optional; can be derived from workflowRequest |
| ERROR | NO_TENANT | app/api/assets/upload-file/route.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | app/api/assets/upload-file/route.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = formData.get("tenantId"); |
| ERROR | NO_TENANT | app/api/assets/upload-file/route.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = formData.get("tenantId"); |
| ERROR | NO_TENANT | app/api/assets/upload-file/route.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!organizationId \|\| !tenantId) { |
| ERROR | NO_TENANT | app/api/assets/upload-file/route.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | { success: false, error: "Missing organizationId or tenantId" }, |
| ERROR | NO_TENANT | app/api/assets/upload-file/route.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | app/api/billing/webhook/route.js:16 | Provider credentials are accessed outside the Service Provider layer. | process.env.STRIPE_WEBHOOK_SECRET |
| ERROR | NO_TENANT | app/api/control/scan/route.js:74 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/control/scan/route.js:58 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/api/control/scan/route.js:59 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/control/scan/route.js:75 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/api/customers/history/route.js:44 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/customers/history/route.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/api/customers/history/route.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/customers/history/route.js:44 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/design/assets/route.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/api/design/assets/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | searchParams.get("tenantId"); |
| ERROR | NO_TENANT | app/api/design/assets/route.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/design/assets/route.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | error: "tenantId required", |
| ERROR | NO_TENANT | app/api/design/assets/route.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/dishes/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = |
| ERROR | NO_TENANT | app/api/dishes/route.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id' |
| ERROR | NO_TENANT | app/api/dishes/route.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | app/api/dishes/route.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | app/api/dishes/route.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | app/api/dishes/route.js:77 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/dishes/route.js:86 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | app/api/dishes/route.js:106 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/finance/cogs/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/finance/cogs/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | NO_TENANT | app/api/forecasting/overview/route.js:52 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | app/api/forecasting/overview/route.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/api/forecasting/overview/route.js:23 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenantId' |
| ERROR | NO_TENANT | app/api/forecasting/overview/route.js:26 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/forecasting/overview/route.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenantId required', |
| ERROR | NO_TENANT | app/api/forecasting/overview/route.js:53 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/google/auth/route.js:13 | Google APIs is used outside the Service Provider layer. | "https://www.googleapis.com/auth/userinfo.profile", |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/google/auth/route.js:14 | Google APIs is used outside the Service Provider layer. | "https://www.googleapis.com/auth/userinfo.email", |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/google/auth/route.js:13 | Google endpoint is called outside the Service Provider layer. | "https://www.googleapis.com/auth/userinfo.profile", |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/google/auth/route.js:14 | Google endpoint is called outside the Service Provider layer. | "https://www.googleapis.com/auth/userinfo.email", |
| ERROR | NO_TENANT | app/api/governance/automation/route.js:52 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = |
| ERROR | NO_TENANT | app/api/governance/automation/route.js:55 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | app/api/governance/automation/route.js:72 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/governance/automation/route.js:87 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/governance/automation/route.js:88 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/governance/automation/route.js:119 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/governance/automation/route.js:120 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/governance/automation/route.js:53 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/governance/automation/route.js:71 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/governance/deployment/check/route.js:48 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = |
| ERROR | NO_TENANT | app/api/governance/deployment/check/route.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/governance/deployment/check/route.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | app/api/governance/deployment/check/route.js:49 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/governance/deployment/request/route.js:46 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = |
| ERROR | NO_TENANT | app/api/governance/deployment/request/route.js:52 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/governance/deployment/request/route.js:53 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/governance/deployment/request/route.js:47 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/healthcare/billing/route.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | await billingTimeline({ tenantId: body.organization_id, billing: data }); |
| ERROR | NO_TENANT | app/api/healthcare/billing/route.js:37 | Legacy tenant context found. Use organization_id and entity_id where required. | await billingTimeline({ tenantId: body.organization_id, billing: data }); |
| ERROR | NO_TENANT | app/api/healthcare/medical-records/route.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | await medicalRecordTimeline({ tenantId: body.organization_id, medicalRecord: data }); |
| ERROR | NO_TENANT | app/api/healthcare/medical-records/route.js:37 | Legacy tenant context found. Use organization_id and entity_id where required. | await medicalRecordTimeline({ tenantId: body.organization_id, medicalRecord: data }); |
| ERROR | NO_TENANT | app/api/intake/classify/route.js:283 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/intake/classify/route.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/intake/classify/route.js:284 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/intake/classify/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/intake/classify/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | NO_TENANT | app/api/kpi/overview/route.js:49 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | app/api/kpi/overview/route.js:57 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | app/api/kpi/overview/route.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/kpi/overview/route.js:50 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/api/kpi/overview/route.js:58 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/marketing/build-caption/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/marketing/build-caption/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/delete-post/route.js:87 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${campaign.facebook_post_id}?access_token=${access_token}`, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/delete-post/route.js:102 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${campaign.instagram_post_id}?access_token=${access_token}`, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/delete-post/route.js:87 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${campaign.facebook_post_id}?access_token=${access_token}`, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/delete-post/route.js:102 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${campaign.instagram_post_id}?access_token=${access_token}`, |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/marketing/delete-post/route.js:87 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${campaign.facebook_post_id}?access_token=${access_token}`, |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/marketing/delete-post/route.js:102 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${campaign.instagram_post_id}?access_token=${access_token}`, |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/marketing/delete-post/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/marketing/delete-post/route.js:1 | Service-related API route does not reference organization_id. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/marketing/delete-post/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/marketing/process-generation-job/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/marketing/process-generation-job/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/publish-instagram/route.js:59 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${instagram_business_id}/media`, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/publish-instagram/route.js:102 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${instagram_business_id}/media_publish`, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/publish-instagram/route.js:59 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${instagram_business_id}/media`, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/publish-instagram/route.js:102 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${instagram_business_id}/media_publish`, |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/marketing/publish-instagram/route.js:59 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${instagram_business_id}/media`, |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/marketing/publish-instagram/route.js:102 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${instagram_business_id}/media_publish`, |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/marketing/publish-instagram/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/marketing/publish-instagram/route.js:1 | Service-related API route does not reference organization_id. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/marketing/publish-instagram/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/sync-analytics/route.js:80 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${campaign.instagram_post_id}/insights?metric=likes,comments,shares,reach,impressions,saved&access_token=${account.access_token}` |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/marketing/sync-analytics/route.js:80 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${campaign.instagram_post_id}/insights?metric=likes,comments,shares,reach,impressions,saved&access_token=${account.access_token}` |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/marketing/sync-analytics/route.js:80 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${campaign.instagram_post_id}/insights?metric=likes,comments,shares,reach,impressions,saved&access_token=${account.access_token}` |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/marketing/sync-analytics/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/marketing/sync-analytics/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | NO_TENANT | app/api/messages/add-members/route.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/add-members/route.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/broadcast/route.js:69 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/broadcast/route.js:70 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/broadcast/route.js:117 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/messages/broadcast/route.js:118 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id |
| ERROR | NO_TENANT | app/api/messages/broadcast/route.js:136 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/broadcast/route.js:137 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/broadcast/route.js:163 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/broadcast/route.js:164 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/create-group/route.js:70 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/create-group/route.js:71 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/create-group/route.js:122 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/create-group/route.js:123 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/create-private/route.js:103 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/create-private/route.js:104 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/create-private/route.js:147 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/create-private/route.js:148 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/create-private/route.js:160 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/create-private/route.js:161 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/create-thread/route.js:55 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/create-thread/route.js:56 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/create-thread/route.js:97 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/create-thread/route.js:98 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/inbox/route.js:47 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/messages/inbox/route.js:48 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id |
| ERROR | NO_TENANT | app/api/messages/online-status/route.js:44 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/online-status/route.js:45 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/online-status/route.js:121 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/messages/online-status/route.js:122 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id |
| ERROR | NO_TENANT | app/api/messages/report/route.js:71 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/report/route.js:72 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/send/route.js:111 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/send/route.js:112 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | NO_TENANT | app/api/messages/thread/route.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/messages/thread/route.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/messages/thread/route.js:55 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/messages/thread/route.js:70 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/messages/upload-attachment/route.js:45 | Legacy tenant context found. Use organization_id and entity_id where required. | `message-attachments/${identity.tenant_id}/${Date.now()}-${file.name}`; |
| ERROR | NO_TENANT | app/api/messages/voice-note/route.js:68 | Legacy tenant context found. Use organization_id and entity_id where required. | `voice-notes/${identity.tenant_id}/${Date.now()}.webm`; |
| ERROR | NO_TENANT | app/api/messages/voice-note/route.js:127 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/messages/voice-note/route.js:128 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/Publish/route.js:128 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${account.page_id}/photos`, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/Publish/route.js:128 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${account.page_id}/photos`, |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/meta/Publish/route.js:128 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${account.page_id}/photos`, |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/meta/Publish/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/Publish/route.js:1 | Service-related API route does not reference organization_id. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/Publish/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/auth/callback/route.js:36 | Meta Graph is used outside the Service Provider layer. | "https://graph.facebook.com/v23.0/oauth/access_token" |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/auth/callback/route.js:91 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/me/accounts?access_token=${tokenData.access_token}` |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/auth/callback/route.js:129 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}` |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/auth/callback/route.js:36 | Meta Graph is used outside the Service Provider layer. | "https://graph.facebook.com/v23.0/oauth/access_token" |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/auth/callback/route.js:91 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/me/accounts?access_token=${tokenData.access_token}` |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/auth/callback/route.js:129 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}` |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/meta/auth/callback/route.js:36 | Meta endpoint is called outside the Service Provider layer. | "https://graph.facebook.com/v23.0/oauth/access_token" |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/meta/auth/callback/route.js:91 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/me/accounts?access_token=${tokenData.access_token}` |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/meta/auth/callback/route.js:129 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}` |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | app/api/meta/auth/callback/route.js:41 | Provider credentials are accessed outside the Service Provider layer. | process.env.META_APP_ID |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | app/api/meta/auth/callback/route.js:46 | Provider credentials are accessed outside the Service Provider layer. | process.env.META_APP_SECRET |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/meta/auth/callback/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/auth/callback/route.js:1 | Service-related API route does not reference organization_id. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/auth/callback/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/auth/route.js:18 | Meta Graph is used outside the Service Provider layer. | "https://www.facebook.com/v23.0/dialog/oauth" |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | app/api/meta/auth/route.js:23 | Provider credentials are accessed outside the Service Provider layer. | process.env.META_APP_ID |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/me/route.js:11 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/me?fields=id,name,email&access_token=${token}` |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/meta/me/route.js:11 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/me?fields=id,name,email&access_token=${token}` |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/meta/me/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/me/route.js:1 | Service-related API route does not reference organization_id. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/me/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/pages/route.js:15 | Meta Graph is used outside the Service Provider layer. | const url = new URL("https://graph.facebook.com/v23.0/me/accounts"); |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/pages/route.js:15 | Meta Graph is used outside the Service Provider layer. | const url = new URL("https://graph.facebook.com/v23.0/me/accounts"); |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/meta/pages/route.js:15 | Meta endpoint is called outside the Service Provider layer. | const url = new URL("https://graph.facebook.com/v23.0/me/accounts"); |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/meta/pages/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/pages/route.js:1 | Service-related API route does not reference organization_id. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/pages/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/post/route.js:20 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/me/accounts?access_token=${token}` |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/post/route.js:36 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/${page.id}/photos`, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/meta/post/route.js:20 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/me/accounts?access_token=${token}` |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/meta/post/route.js:20 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/me/accounts?access_token=${token}` |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/meta/post/route.js:36 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/${page.id}/photos`, |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/meta/post/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/post/route.js:1 | Service-related API route does not reference organization_id. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/meta/post/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | NO_TENANT | app/api/orchestration/day-closed/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/day-closed/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/recovery/dead-letter/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/recovery/dead-letter/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/recovery/replay/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/recovery/replay/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/recovery/retry/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/recovery/retry/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/rules-engine/actions/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/rules-engine/actions/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/rules-engine/create/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/rules-engine/create/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/rules-engine/evaluate/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/rules-engine/evaluate/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/shift-closed/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", body.tenantId) |
| ERROR | NO_TENANT | app/api/orchestration/shift-closed/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", body.tenantId) |
| ERROR | NO_TENANT | app/api/orchestration/shift-closed/route.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/shift-closed/route.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/state-machine/history/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/state-machine/history/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/state-machine/transition/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/state-machine/transition/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/workflows/execute/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/workflows/execute/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/workflows/register/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/workflows/register/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/orchestration/workflows/status/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/orchestration/workflows/status/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/organizations/create/route.js:28 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/organizations/create/route.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/owner/route.js:102 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/owner/route.js:127 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/owner/route.js:146 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/owner/route.js:163 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/owner/route.js:351 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/owner/route.js:46 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/api/owner/route.js:47 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/owner/route.js:49 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/owner/route.js:103 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/api/owner/route.js:128 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/api/owner/route.js:147 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/api/owner/route.js:164 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/api/owner/route.js:352 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/api/payroll/attendance/check-in/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/payroll/attendance/check-in/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/payroll/export/route.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/payroll/export/route.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/payroll/generate/route.js:25 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/payroll/generate/route.js:26 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/payroll/labor-cost/allocation/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/payroll/labor-cost/allocation/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/payroll/service-charge/distribute/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/payroll/service-charge/distribute/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/payroll/shift-performance/calculate/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/payroll/shift-performance/calculate/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/performance/list/route.js:49 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = |
| ERROR | NO_TENANT | app/api/performance/list/route.js:62 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/api/performance/list/route.js:62 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/api/performance/list/route.js:72 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/route.js:72 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/route.js:85 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/api/performance/list/route.js:85 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/api/performance/list/route.js:50 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:51 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:78 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:78 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:86 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:86 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:162 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: tenant_id, |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:217 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:217 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:232 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:232 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:247 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:247 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:52 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/performance/list/today/route.js:162 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: tenant_id, |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/platform/services/providers/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/platform/services/providers/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/platform/usage/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/platform/usage/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/platform/wallet/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/platform/wallet/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/platform/wallet/transactions/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/platform/wallet/transactions/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | NO_TENANT | app/api/queue/retry/route.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/queue/retry/route.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | body?.tenantId, |
| ERROR | NO_TENANT | app/api/reviews/list/route.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/reviews/list/route.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = body.tenantId; |
| ERROR | NO_TENANT | app/api/reviews/list/route.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = body.tenantId; |
| ERROR | NO_TENANT | app/api/reviews/list/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/reviews/list/route.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | return NextResponse.json({ success: false, error: "Missing tenantId" }, { status: 400 }); |
| ERROR | NO_TENANT | app/api/reviews/list/route.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/reviews/sync-facebook/route.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/reviews/sync-facebook/route.js:51 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | app/api/reviews/sync-facebook/route.js:69 | Legacy tenant context found. Use organization_id and entity_id where required. | onConflict: "tenant_id,platform,external_review_id", |
| ERROR | NO_TENANT | app/api/reviews/sync-facebook/route.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | const { tenantId } = await req.json(); |
| ERROR | NO_TENANT | app/api/reviews/sync-facebook/route.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/reviews/sync-facebook/route.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | return NextResponse.json({ success: false, error: "Missing tenantId" }, { status: 400 }); |
| ERROR | NO_TENANT | app/api/reviews/sync-facebook/route.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/reviews/sync-facebook/route.js:51 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/reviews/sync-facebook/route.js:36 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v19.0/${pageId}/ratings` + |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/reviews/sync-facebook/route.js:36 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v19.0/${pageId}/ratings` + |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/reviews/sync-facebook/route.js:36 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v19.0/${pageId}/ratings` + |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | app/api/reviews/sync-facebook/route.js:24 | Provider credentials are accessed outside the Service Provider layer. | const pageId = profile?.external_id \|\| process.env.FACEBOOK_PAGE_ID; |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | app/api/reviews/sync-facebook/route.js:25 | Provider credentials are accessed outside the Service Provider layer. | const accessToken = profile?.access_token \|\| process.env.FACEBOOK_PAGE_ACCESS_TOKEN; |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/reviews/sync-facebook/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/reviews/sync-facebook/route.js:1 | Service-related API route does not reference organization_id. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/reviews/sync-facebook/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | NO_TENANT | app/api/reviews/sync-google/route.js:23 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/reviews/sync-google/route.js:46 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | app/api/reviews/sync-google/route.js:62 | Legacy tenant context found. Use organization_id and entity_id where required. | onConflict: "tenant_id,platform,external_review_id", |
| ERROR | NO_TENANT | app/api/reviews/sync-google/route.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | const { tenantId } = await req.json(); |
| ERROR | NO_TENANT | app/api/reviews/sync-google/route.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/reviews/sync-google/route.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | return NextResponse.json({ success: false, error: "Missing tenantId" }, { status: 400 }); |
| ERROR | NO_TENANT | app/api/reviews/sync-google/route.js:23 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/reviews/sync-google/route.js:46 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | DIRECT_PROVIDER_BYPASS | app/api/reviews/sync-google/route.js:35 | Google APIs is used outside the Service Provider layer. | "https://maps.googleapis.com/maps/api/place/details/json" + |
| ERROR | DIRECT_PROVIDER_ENDPOINT | app/api/reviews/sync-google/route.js:35 | Google endpoint is called outside the Service Provider layer. | "https://maps.googleapis.com/maps/api/place/details/json" + |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | app/api/reviews/sync-google/route.js:14 | Provider credentials are accessed outside the Service Provider layer. | const apiKey = process.env.GOOGLE_PLACES_API_KEY; |
| ERROR | NO_TENANT | app/api/reviews/sync-platforms/route.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | const { tenantId } = await req.json(); |
| ERROR | NO_TENANT | app/api/reviews/sync-platforms/route.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/reviews/sync-platforms/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | error: "Missing tenantId", |
| ERROR | NO_TENANT | app/api/reviews/sync-platforms/route.js:45 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/reviews/sync-platforms/route.js:89 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/reviews/sync/route.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = body.tenantId; |
| ERROR | NO_TENANT | app/api/reviews/sync/route.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = body.tenantId; |
| ERROR | NO_TENANT | app/api/reviews/sync/route.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/reviews/sync/route.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | return NextResponse.json({ success: false, error: "Missing tenantId" }, { status: 400 }); |
| ERROR | NO_TENANT | app/api/reviews/sync/route.js:26 | Legacy tenant context found. Use organization_id and entity_id where required. | body: JSON.stringify({ tenantId }), |
| ERROR | NO_TENANT | app/api/settings/kitchen/load/route.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/kitchen/load/route.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/kitchen/save/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/kitchen/save/route.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/marketing/load/route.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/settings/marketing/load/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/marketing/load/route.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | app/api/settings/marketing/save/route.js:22 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/settings/marketing/save/route.js:49 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id,organization_id", |
| ERROR | NO_TENANT | app/api/settings/marketing/save/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/marketing/save/route.js:23 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/operational/route.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | app/api/settings/operational/route.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/settings/payroll/load/route.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/api/settings/payroll/load/route.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/settings/payroll/load/route.js:48 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/payroll/save/route.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/api/settings/payroll/save/route.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/settings/payroll/save/route.js:47 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/pos/load/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/pos/load/route.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/pos/save/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/pos/save/route.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/tables/load/route.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/tables/load/route.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/tables/save/route.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/settings/tables/save/route.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | SERVICE_API_WITHOUT_BUSINESS_CONTEXT | app/api/staff/ai-feed/route.js:1 | Service-related API route does not visibly resolve BusinessContext. | route.js |
| ERROR | SERVICE_API_IDENTITY_CONTEXT | app/api/staff/ai-feed/route.js:1 | Service-related API route does not reference party_id. | route.js |
| ERROR | NO_TENANT | app/api/staff/ai-memory/route.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | app/api/staff/ai-memory/route.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | body.tenantId, |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = searchParams.get("tenant_id"); |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = searchParams.get("tenant_id"); |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:36 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = formData.get("tenant_id"); |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:36 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = formData.get("tenant_id"); |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:41 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!file \|\| !tenant_id) { |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | return NextResponse.json({ success: false, error: "Missing file or tenant_id" }, { status: 400 }); |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:46 | Legacy tenant context found. Use organization_id and entity_id where required. | const filePath = `staff-documents/${tenant_id}/${Date.now()}-${file.name}`; |
| ERROR | NO_TENANT | app/api/staff/documents/route.js:66 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenant_id = |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | searchParams.get("tenant_id"); |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id \|\| !email) { |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:25 | Legacy tenant context found. Use organization_id and entity_id where required. | "Missing tenant_id or email", |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:44 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:90 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/staff/profile-overview/route.js:91 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | app/api/staff/route.js:179 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/staff/route.js:259 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | app/api/staff/route.js:301 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/staff/route.js:156 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | app/api/staff/route.js:179 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/staff/route.js:259 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | app/api/staff/route.js:301 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = searchParams.get("tenant_id"); |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | staffQuery = staffQuery.eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:79 | Legacy tenant context found. Use organization_id and entity_id where required. | staffAccount?.tenant_id \|\| tenantId; |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:98 | Legacy tenant context found. Use organization_id and entity_id where required. | scheduleQuery = scheduleQuery.eq("tenant_id", resolvedTenantId); |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:113 | Legacy tenant context found. Use organization_id and entity_id where required. | activeShiftQuery = activeShiftQuery.eq("tenant_id", resolvedTenantId); |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = searchParams.get("tenant_id"); |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:62 | Legacy tenant context found. Use organization_id and entity_id where required. | if (tenantId) { |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | staffQuery = staffQuery.eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:79 | Legacy tenant context found. Use organization_id and entity_id where required. | staffAccount?.tenant_id \|\| tenantId; |
| ERROR | NO_TENANT | app/api/staff/runtime/route.js:138 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: resolvedTenantId, |
| ERROR | NO_TENANT | app/api/staff/search/route.js:58 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | app/api/staff/search/route.js:59 | Legacy tenant context found. Use organization_id and entity_id where required. | identity.tenant_id |
| ERROR | NO_TENANT | app/api/users/create/route.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/users/create/route.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!name \|\| !email \|\| !role \|\| !tenant_id) { |
| ERROR | NO_TENANT | app/api/users/create/route.js:55 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | app/api/work-centers/orders/route.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: body.tenantId, |
| ERROR | NO_TENANT | app/api/work-centers/orders/route.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: body.tenantId, |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:142 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:150 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:158 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:165 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:172 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:179 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:186 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:193 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:82 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:83 | Legacy tenant context found. Use organization_id and entity_id where required. | access.tenantId; |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:116 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:119 | Legacy tenant context found. Use organization_id and entity_id where required. | error: "Missing tenantId", |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:142 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:150 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:158 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:165 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:172 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:179 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:186 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/api/workspace/command-center/route.js:193 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | app/login/callback/page.js:39 | Legacy tenant context found. Use organization_id and entity_id where required. | document.cookie = `tenant_id=${data.tenant_id}; path=/`; |
| ERROR | NO_TENANT | app/login/callback/page.js:39 | Legacy tenant context found. Use organization_id and entity_id where required. | document.cookie = `tenant_id=${data.tenant_id}; path=/`; |
| ERROR | NO_TENANT | components/AuthGuard.jsx:97 | Legacy tenant context found. Use organization_id and entity_id where required. | staff.tenant_id, |
| ERROR | NO_TENANT | components/AuthGuard.jsx:96 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | components/approval/ApprovalRuntimePanel.jsx:18 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | components/approval/ApprovalRuntimePanel.jsx:29 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | components/approval/ApprovalRuntimePanel.jsx:35 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | components/approval/ApprovalRuntimePanel.jsx:48 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | components/approval/ApprovalRuntimePanel.jsx:53 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | components/approval/ApprovalRuntimePanel.jsx:61 | Legacy tenant context found. Use organization_id and entity_id where required. | `approval-runtime-${tenantId}`, |
| ERROR | NO_TENANT | components/approval/ApprovalRuntimePanel.jsx:97 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | components/reviews/ReviewFeed.jsx:5 | Legacy tenant context found. Use organization_id and entity_id where required. | export default function ReviewFeed({ tenantId, platform = "ALL", limit = 20 }) { |
| ERROR | NO_TENANT | components/reviews/ReviewFeed.jsx:10 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) return; |
| ERROR | NO_TENANT | components/reviews/ReviewFeed.jsx:18 | Legacy tenant context found. Use organization_id and entity_id where required. | body: JSON.stringify({ tenantId, platform, limit }), |
| ERROR | NO_TENANT | components/reviews/ReviewFeed.jsx:33 | Legacy tenant context found. Use organization_id and entity_id where required. | }, [tenantId, platform, limit]); |
| ERROR | NO_TENANT | lib/accounting/createAccountingClient.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/accounting/createAccountingClient.js:53 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/accounting/mapInvoiceItems.js:77 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/accounting/mapInvoiceItems.js:91 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/accounting/mapInvoiceItems.js:58 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/accounting/mapInvoiceItems.js:77 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/accounting/mapInvoiceItems.js:91 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/ai/assets/buildAssetIntelligence.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/assets/buildAssetIntelligence.js:23 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/assets/buildAssetIntelligence.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/assets/buildAssetIntelligence.js:45 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/assets/getTopPerformingAssets.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/assets/getTopPerformingAssets.js:45 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/ai/memory/getTopPerformingCampaigns.js:26 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/ai/memory/getTopPerformingCampaigns.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/memory/getTopPerformingCampaigns.js:27 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/ai/profiles/getOrCreateBusinessProfile.js:115 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/ai/profiles/getOrCreateBusinessProfile.js:167 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/ai/profiles/getOrCreateBusinessProfile.js:91 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/profiles/getOrCreateBusinessProfile.js:94 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | lib/ai/profiles/getOrCreateBusinessProfile.js:96 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenantId required" |
| ERROR | NO_TENANT | lib/ai/profiles/getOrCreateBusinessProfile.js:116 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/ai/profiles/getOrCreateBusinessProfile.js:140 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/profiles/getOrCreateBusinessProfile.js:168 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/profiles/resolveTenantIndustries.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/ai/profiles/resolveTenantIndustries.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/ai/profiles/resolveTenantIndustries.js:22 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/ai/prompts/buildPrompt.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/ai/prompts/buildPrompt.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | state.tenantId, |
| ERROR | NO_TENANT | lib/analytics/createSnapshot.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/analytics/createSnapshot.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/analytics/loadHourlySales.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/analytics/loadHourlySales.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | lib/analytics/loadHourlySales.js:28 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/analytics/loadHourlySales.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/analytics/loadRestaurantAnalytics.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/analytics/loadRestaurantAnalytics.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | lib/analytics/loadRestaurantAnalytics.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/analytics/loadRestaurantAnalytics.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/analytics/warehouse/buildRevenueAnalytics.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/analytics/warehouse/buildRevenueAnalytics.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/analytics/warehouse/buildRevenueAnalytics.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/api/securePermissionRoute.js:37 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/api/securePermissionRoute.js:38 | Legacy tenant context found. Use organization_id and entity_id where required. | user.tenant_id, |
| ERROR | NO_TENANT | lib/approval/runtime/createApprovalTask.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/approval/runtime/createApprovalTask.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/approval/runtime/createApprovalTask.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/approval/runtime/loadApprovalTasks.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | lib/approval/runtime/loadApprovalTasks.js:6 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/approval/runtime/loadApprovalTasks.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/approval/runtime/loadRealtimeApprovals.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | lib/approval/runtime/loadRealtimeApprovals.js:6 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/approval/runtime/loadRealtimeApprovals.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/audit/logAuditEvent.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: input.tenant_id ?? input.tenantId ?? null, |
| ERROR | NO_TENANT | lib/audit/logAuditEvent.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: input.tenant_id ?? input.tenantId ?? null, |
| ERROR | NO_TENANT | lib/audit/logAuditEvent.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: input.tenant_id ?? input.tenantId ?? null, |
| ERROR | NO_TENANT | lib/auth/checkPermission.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/auth/checkPermission.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/auth/checkPermission.js:25 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/auth/rbac/checkPermission.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/auth/rbac/checkPermission.js:25 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/auth/rbac/checkPermission.js:26 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/automation/loadAutomationStatus.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/automation/loadAutomationStatus.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | lib/automation/loadAutomationStatus.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/automation/loadAutomationStatus.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/automation/loadAutomationStatus.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/automation/loadAutomationStatus.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/automation/loadAutomationStatus.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/automation/loadAutomationStatus.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/billing/stripe.js:1 | Stripe is used outside the Service Provider layer. | import Stripe from "stripe"; |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/billing/stripe.js:16 | Stripe is used outside the Service Provider layer. | stripeInstance = new Stripe( |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | lib/billing/stripe.js:10 | Provider credentials are accessed outside the Service Provider layer. | if (!process.env.STRIPE_SECRET_KEY) { |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | lib/billing/stripe.js:17 | Provider credentials are accessed outside the Service Provider layer. | process.env.STRIPE_SECRET_KEY, |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:53 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:67 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:81 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:3 | Legacy tenant context found. Use organization_id and entity_id where required. | async function upsertCustomer(tenantId, source, sourceId, firstName, lastName, email, phone) { |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:38 | Legacy tenant context found. Use organization_id and entity_id where required. | export async function ingestCustomer360({ tenantId }) { |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:39 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) throw new Error("tenantId required"); |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:39 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) throw new Error("tenantId required"); |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | supabaseAdmin.from("hotel_guests").select("*").eq("organization_id", tenantId), |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | supabaseAdmin.from("healthcare_patients").select("*").eq("organization_id", tenantId), |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:44 | Legacy tenant context found. Use organization_id and entity_id where required. | supabaseAdmin.from("accounting_client_profiles").select("*").eq("firm_organization_id", tenantId), |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:50 | Legacy tenant context found. Use organization_id and entity_id where required. | const customer = await upsertCustomer(tenantId, "hotel", h.id, h.first_name, h.last_name, h.email, h.phone); |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:53 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | const customer = await upsertCustomer(tenantId, "healthcare", p.id, p.first_name, p.last_name, p.email, p.phone); |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:67 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:78 | Legacy tenant context found. Use organization_id and entity_id where required. | const customer = await upsertCustomer(tenantId, "accounting", c.client_organization_id, null, null, null, null); |
| ERROR | NO_TENANT | lib/customer/ingestCustomer360.js:81 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/loadCustomerFlow.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/customer/loadCustomerFlow.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | lib/customer/loadCustomerFlow.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/customer/loadCustomerFlow.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:54 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:72 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:82 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:119 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:171 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:272 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:38 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:41 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId \|\| !customer?.id) { |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:54 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:72 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:82 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:119 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:139 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:149 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:150 | Legacy tenant context found. Use organization_id and entity_id where required. | throw new Error("tenantId required"); |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:171 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:272 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:298 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:307 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/customer/processCustomerVisit.js:328 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/customer/runtime/createVIPCustomerEvent.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/customer/runtime/createVIPCustomerEvent.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/customer/runtime/createVIPCustomerEvent.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/dashboard/loadDashboardSummary.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/dashboard/loadDashboardSummary.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | lib/dashboard/loadDashboardSummary.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/dashboard/loadDashboardSummary.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/dashboard/loadDashboardSummary.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/dashboard/loadDashboardSummary.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/dashboard/loadDashboardSummary.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/dashboard/loadDashboardSummary.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:48 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:68 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:78 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:88 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:98 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | export async function loadExecutiveDashboard({ tenantId } = {}) { |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: null, |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:48 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:68 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:78 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:88 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:98 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/dashboard/runtime/loadExecutiveDashboard.js:183 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/datawarehouse/buildExecutiveSnapshot.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/datawarehouse/buildExecutiveSnapshot.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/datawarehouse/buildExecutiveSnapshot.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/datawarehouse/buildExecutiveSnapshot.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/design/assets/getCreativeAssets.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId = null, |
| ERROR | NO_TENANT | lib/design/assets/getCreativeAssets.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | organizationId \|\| tenantId; |
| ERROR | NO_TENANT | lib/design/assets/getCreativeAssetsClient.js:2 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/design/assets/getCreativeAssetsClient.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | if (tenantId) { |
| ERROR | NO_TENANT | lib/design/assets/getCreativeAssetsClient.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | params.set("tenantId", tenantId); |
| ERROR | NO_TENANT | lib/design/assets/getCreativeAssetsClient.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | params.set("tenantId", tenantId); |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceScoring.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceScoring.js:27 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceScoring.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceScoring.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceScoring.js:27 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceValidation.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceValidation.js:35 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceValidation.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceValidation.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/governance/finance/runComplianceValidation.js:35 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/validateEventPolicy.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/governance/finance/validateEventPolicy.js:37 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/validateEventPolicy.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/validateEventPolicy.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/validateEventPolicy.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/governance/finance/validateEventPolicy.js:37 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/governance/finance/validateEventPolicy.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/hotel/checkOutGuest.js:39 | Legacy tenant context found. Use organization_id and entity_id where required. | await checkoutTimeline({ tenantId: booking.organization_id, booking }); |
| ERROR | NO_TENANT | lib/hotel/recordBookingEvent.js:3 | Legacy tenant context found. Use organization_id and entity_id where required. | export async function recordBookingEvent({ tenantId, booking }) { |
| ERROR | NO_TENANT | lib/hotel/recordBookingEvent.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/hotel/recordBookingEvent.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | export async function recordCheckinEvent({ tenantId, booking }) { |
| ERROR | NO_TENANT | lib/hotel/recordBookingEvent.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/hotel/recordBookingEvent.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | export async function recordCheckoutEvent({ tenantId, booking }) { |
| ERROR | NO_TENANT | lib/hotel/recordBookingEvent.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intake/workflows/processExpenseReceipt.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/intake/workflows/processExpenseReceipt.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | submission.tenant_id, |
| ERROR | NO_TENANT | lib/intake/workflows/processMarketingAsset.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | submission.tenant_id, |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | lib/integrations/googleAuth.js:11 | Provider credentials are accessed outside the Service Provider layer. | process.env.GOOGLE_CLIENT_ID, |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | lib/integrations/googleAuth.js:12 | Provider credentials are accessed outside the Service Provider layer. | process.env.GOOGLE_CLIENT_SECRET, |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/integrations/meta.js:1 | Meta Graph is used outside the Service Provider layer. | const META_GRAPH_BASE = "https://graph.facebook.com"; |
| ERROR | DIRECT_PROVIDER_ENDPOINT | lib/integrations/meta.js:1 | Meta endpoint is called outside the Service Provider layer. | const META_GRAPH_BASE = "https://graph.facebook.com"; |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | lib/integrations/meta.js:2 | Provider credentials are accessed outside the Service Provider layer. | const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION \|\| "v23.0"; |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/integrations/metaAuth.js:28 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v18.0/oauth/access_token` + |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/integrations/metaAuth.js:15 | Meta Graph is used outside the Service Provider layer. | `https://www.facebook.com/v18.0/dialog/oauth` + |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/integrations/metaAuth.js:28 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v18.0/oauth/access_token` + |
| ERROR | DIRECT_PROVIDER_ENDPOINT | lib/integrations/metaAuth.js:28 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v18.0/oauth/access_token` + |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | lib/integrations/metaAuth.js:3 | Provider credentials are accessed outside the Service Provider layer. | clientId: process.env.META_APP_ID, |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | lib/integrations/metaAuth.js:4 | Provider credentials are accessed outside the Service Provider layer. | clientSecret: process.env.META_APP_SECRET, |
| ERROR | NO_TENANT | lib/intelligence/finance/accountingAICopilot.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/accountingAICopilot.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/accountingAICopilot.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/getAIInsights.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/getAIInsights.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/getAIInsights.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/getAIInsights.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/getAIInsights.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIExecutiveDecisions.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIExecutiveDecisions.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIExecutiveDecisions.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIExecutiveDecisions.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIExecutiveDecisions.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIExecutiveDecisions.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIExecutiveDecisions.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOperatingSystem.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOperatingSystem.js:62 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOperatingSystem.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOperatingSystem.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOperatingSystem.js:62 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOptimizationEngine.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOptimizationEngine.js:23 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOptimizationEngine.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOptimizationEngine.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runAIOptimizationEngine.js:23 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingKPIs.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingKPIs.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingKPIs.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingKPIs.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingKPIs.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingRecommendations.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingRecommendations.js:27 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingRecommendations.js:44 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingRecommendations.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingRecommendations.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingRecommendations.js:27 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAccountingRecommendations.js:44 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAnomalyDetection.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runAnomalyDetection.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAnomalyDetection.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runAnomalyDetection.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runAnomalyDetection.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runCashflowForecast.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runCashflowForecast.js:45 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runCashflowForecast.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runCashflowForecast.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runCashflowForecast.js:45 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runEntityProfitabilityRanking.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runEntityProfitabilityRanking.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runEntityProfitabilityRanking.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveAlerts.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveAlerts.js:26 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveAlerts.js:41 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveAlerts.js:53 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveAlerts.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveAlerts.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveAlerts.js:26 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveAlerts.js:41 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveAlerts.js:53 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveIntelligence.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveIntelligence.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveIntelligence.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveIntelligence.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveIntelligence.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveKPIs.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | input.tenant_id; |
| ERROR | NO_TENANT | lib/intelligence/finance/runExecutiveKPIs.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | input.tenantId \|\| |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinanceAnomalyDetection.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinanceAnomalyDetection.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinanceAnomalyDetection.js:40 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinanceAnomalyDetection.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinanceAnomalyDetection.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinanceAnomalyDetection.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinanceAnomalyDetection.js:40 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinancialForecast.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinancialForecast.js:56 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinancialForecast.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinancialForecast.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runFinancialForecast.js:56 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runForecastScenario.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runForecastScenario.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runForecastScenario.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runLiquidityRiskAnalysis.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runLiquidityRiskAnalysis.js:56 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runLiquidityRiskAnalysis.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runLiquidityRiskAnalysis.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runLiquidityRiskAnalysis.js:56 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runMarginAnalysis.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runMarginAnalysis.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runMarginAnalysis.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runProfitabilityEngine.js:35 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runProfitabilityEngine.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runProfitabilityEngine.js:35 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runTreasuryForecast.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runTreasuryForecast.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runTreasuryForecast.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runTreasuryForecast.js:60 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runTreasuryForecast.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runTreasuryForecast.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/intelligence/finance/runTreasuryForecast.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runTreasuryForecast.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/intelligence/finance/runTreasuryForecast.js:60 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runVarianceAnalysis.js:28 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runVarianceAnalysis.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runVarianceAnalysis.js:28 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runWasteAnalysis.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runWasteAnalysis.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/intelligence/finance/runWasteAnalysis.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/marketing/distribution/meta/publishing/publishToFacebook.js:41 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${pageId}/photos`, |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/marketing/distribution/meta/publishing/publishToFacebook.js:41 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${pageId}/photos`, |
| ERROR | DIRECT_PROVIDER_ENDPOINT | lib/marketing/distribution/meta/publishing/publishToFacebook.js:41 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/v23.0/${pageId}/photos`, |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/marketing/distribution/meta/utils/validateMetaToken.js:17 | Meta Graph is used outside the Service Provider layer. | `https://graph.facebook.com/me?fields=id,name&access_token=${accessToken}` |
| ERROR | DIRECT_PROVIDER_ENDPOINT | lib/marketing/distribution/meta/utils/validateMetaToken.js:17 | Meta endpoint is called outside the Service Provider layer. | `https://graph.facebook.com/me?fields=id,name&access_token=${accessToken}` |
| ERROR | NO_TENANT | lib/messages/getStaffIdentity.js:52 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/monitoring/createHealthSnapshot.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id = null, |
| ERROR | NO_TENANT | lib/monitoring/createHealthSnapshot.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | if (tenant_id) { |
| ERROR | NO_TENANT | lib/monitoring/createHealthSnapshot.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/monitoring/loadRealtimeMonitoring.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/monitoring/loadRealtimeMonitoring.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | lib/monitoring/loadRealtimeMonitoring.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/monitoring/loadRealtimeMonitoring.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/monitoring/loadRealtimeMonitoring.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/monitoring/loadRealtimeMonitoring.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/monitoring/loadRealtimeMonitoring.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/monitoring/loadRealtimeMonitoring.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/onboarding/provisionOrganization.js:40 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = payload?.tenantId; |
| ERROR | NO_TENANT | lib/onboarding/provisionOrganization.js:40 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = payload?.tenantId; |
| ERROR | NO_TENANT | lib/onboarding/provisionOrganization.js:47 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/operations/work-centers/updateWorkCenterItemStatus.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/operations/work-centers/updateWorkCenterItemStatus.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/operations/work-centers/updateWorkCenterItemStatus.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!itemId \|\| !status \|\| !tenantId) { |
| ERROR | NO_TENANT | lib/operations/work-centers/updateWorkCenterItemStatus.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/createRule.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/createRule.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/createRule.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/evaluateRules.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/evaluateRules.js:52 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/evaluateRules.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/evaluateRules.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/evaluateRules.js:52 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/executeWorkflow.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/executeWorkflow.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/executeWorkflow.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runAutonomousCloseCycle.js:79 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runAutonomousCloseCycle.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runAutonomousCloseCycle.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runAutonomousCloseCycle.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runAutonomousCloseCycle.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runAutonomousCloseCycle.js:79 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runCloseChecklist.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runCloseChecklist.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runCloseChecklist.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:46 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:66 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:85 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:46 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:66 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/orchestration/finance/runContinuousClose.js:85 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runEventOrchestration.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/finance/runEventOrchestration.js:6 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/finance/runEventOrchestration.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/finance/runEventOrchestration.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/getRuleActions.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/getRuleActions.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/getRuleActions.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/getStateHistory.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/getStateHistory.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/getStateHistory.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/getWorkflowStatus.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/getWorkflowStatus.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/getWorkflowStatus.js:13 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/moveToDeadLetterQueue.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/moveToDeadLetterQueue.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/moveToDeadLetterQueue.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/registerWorkflow.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/registerWorkflow.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/registerWorkflow.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/replayDeadLetterQueue.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/replayDeadLetterQueue.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/replayDeadLetterQueue.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/retryFailedOrchestration.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/retryFailedOrchestration.js:36 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/retryFailedOrchestration.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/retryFailedOrchestration.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/orchestration/retryFailedOrchestration.js:36 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/runDayClosedFlow.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | export async function runDayClosedFlow({ tenantId }) { |
| ERROR | NO_TENANT | lib/orchestration/runDayClosedFlow.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | await runExecutiveKPIs({ tenantId }); |
| ERROR | NO_TENANT | lib/orchestration/runDayClosedFlow.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | await runCashFlowEngine({ tenantId }); |
| ERROR | NO_TENANT | lib/orchestration/runDayClosedFlow.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | await generateTrialBalance({ tenantId }); |
| ERROR | NO_TENANT | lib/orchestration/runShiftClosedFlow.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/runShiftClosedFlow.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/runShiftClosedFlow.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/runShiftClosedFlow.js:45 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/runStateTransition.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/orchestration/runStateTransition.js:6 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/orchestration/runStateTransition.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/payments/loadPaymentControl.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/payments/loadPaymentControl.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | lib/payments/loadPaymentControl.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payments/loadPaymentControl.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/payroll/accounting/createPayrollLiabilityJournal.js:3 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/accounting/createPayrollLiabilityJournal.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/audit/createPayrollAuditLog.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/payroll/audit/createPayrollAuditLog.js:6 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/audit/createPayrollAuditLog.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/audit/loadPayrollAuditLogs.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/audit/loadPayrollAuditLogs.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/audit/loadPayrollAuditLogs.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/calculatePayroll.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/payroll/calculatePayroll.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | lib/payroll/calculatePayroll.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id); |
| ERROR | NO_TENANT | lib/payroll/consolidation/acknowledgePayrollRecord.js:79 | Legacy tenant context found. Use organization_id and entity_id where required. | record.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/consolidation/acknowledgePayrollRecord.js:78 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/consolidation/archivePayrollRecord.js:113 | Legacy tenant context found. Use organization_id and entity_id where required. | record.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/consolidation/archivePayrollRecord.js:112 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/consolidation/certifyPayrollRecord.js:128 | Legacy tenant context found. Use organization_id and entity_id where required. | record.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/consolidation/certifyPayrollRecord.js:127 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/consolidation/closePayrollAccountingPeriod.js:144 | Legacy tenant context found. Use organization_id and entity_id where required. | record.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/consolidation/closePayrollAccountingPeriod.js:143 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/consolidation/disputePayrollRecord.js:99 | Legacy tenant context found. Use organization_id and entity_id where required. | record.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/consolidation/disputePayrollRecord.js:98 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/consolidation/finalizePayrollRecord.js:148 | Legacy tenant context found. Use organization_id and entity_id where required. | record.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/consolidation/finalizePayrollRecord.js:147 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:87 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:95 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:104 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:113 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:122 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:256 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:283 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:291 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:61 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:65 | Legacy tenant context found. Use organization_id and entity_id where required. | throw new Error("tenantId required"); |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:75 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:87 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:95 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:104 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:113 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:122 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:242 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:256 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:283 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:291 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/consolidation/generateMonthlyPayroll.js:303 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/consolidation/lockPayrollRecord.js:133 | Legacy tenant context found. Use organization_id and entity_id where required. | record.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/consolidation/lockPayrollRecord.js:132 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/consolidation/rejectPayrollRecord.js:140 | Legacy tenant context found. Use organization_id and entity_id where required. | record.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/consolidation/rejectPayrollRecord.js:139 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/consolidation/resolvePayrollDispute.js:122 | Legacy tenant context found. Use organization_id and entity_id where required. | record.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/consolidation/resolvePayrollDispute.js:121 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/core/allocateLaborCost.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/allocateLaborCost.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/allocateLaborCost.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/calculateShiftPerformance.js:35 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/calculateShiftPerformance.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/calculateShiftPerformance.js:35 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/checkInStaff.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/checkInStaff.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/checkInStaff.js:32 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/distributeServiceCharge.js:22 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/core/distributeServiceCharge.js:89 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/payroll/core/distributeServiceCharge.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/core/distributeServiceCharge.js:23 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/core/distributeServiceCharge.js:90 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/export/exportPayrollPeriod.js:28 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/export/exportPayrollPeriod.js:6 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/export/exportPayrollPeriod.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/generatePayrollRecords.js:78 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/payroll/generatePayrollRecords.js:214 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/payroll/generatePayrollRecords.js:381 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/payroll/generatePayrollRecords.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/generatePayrollRecords.js:35 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/generatePayrollRecords.js:78 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId); |
| ERROR | NO_TENANT | lib/payroll/generatePayrollRecords.js:215 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/generatePayrollRecords.js:382 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/history/loadPayrollPeriods.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/history/loadPayrollPeriods.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/history/loadPayrollPeriods.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/loadDailyPayrollPreview.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/payroll/loadDailyPayrollPreview.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | lib/payroll/loadDailyPayrollPreview.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/loadDailyPayrollPreview.js:34 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/payroll/payments/executePayrollPayment.js:40 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/payments/executePayrollPayment.js:76 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/payroll/payments/executePayrollPayment.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/payments/executePayrollPayment.js:41 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/payments/executePayrollPayment.js:77 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/payments/executePayrollPayment.js:111 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/policies/loadTenantPayoutPolicy.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/policies/loadTenantPayoutPolicy.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/policies/loadTenantPayoutPolicy.js:6 | Legacy tenant context found. Use organization_id and entity_id where required. | if (process.env.NODE_ENV !== "production") console.log("LOAD POLICY", tenantId); |
| ERROR | NO_TENANT | lib/payroll/policies/loadTenantPayoutPolicy.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/payroll/serviceCharge/calculateDailyPayouts.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/serviceCharge/calculateDailyPayouts.js:15 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/serviceCharge/calculateDailyPayouts.js:28 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/snapshots/approvePayrollReopen.js:117 | Legacy tenant context found. Use organization_id and entity_id where required. | request.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/snapshots/approvePayrollReopen.js:139 | Legacy tenant context found. Use organization_id and entity_id where required. | request.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/snapshots/approvePayrollReopen.js:116 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/snapshots/approvePayrollReopen.js:138 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/snapshots/closePayrollPeriod.js:36 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/snapshots/closePayrollPeriod.js:6 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/snapshots/closePayrollPeriod.js:37 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/snapshots/createPayrollSnapshot.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/snapshots/createPayrollSnapshot.js:84 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/payroll/snapshots/createPayrollSnapshot.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/snapshots/createPayrollSnapshot.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/snapshots/createPayrollSnapshot.js:43 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/snapshots/createPayrollSnapshot.js:85 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/snapshots/loadPayrollReopenRequests.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/snapshots/loadPayrollReopenRequests.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/snapshots/loadPayrollReopenRequests.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/snapshots/rejectPayrollReopen.js:116 | Legacy tenant context found. Use organization_id and entity_id where required. | request.tenant_id, |
| ERROR | NO_TENANT | lib/payroll/snapshots/rejectPayrollReopen.js:115 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: |
| ERROR | NO_TENANT | lib/payroll/snapshots/reopenPayrollPeriod.js:63 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/payroll/snapshots/reopenPayrollPeriod.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/snapshots/reopenPayrollPeriod.js:64 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/payroll/snapshots/reopenPayrollPeriod.js:78 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/snapshots/requestPayrollReopen.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/payroll/snapshots/requestPayrollReopen.js:9 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/snapshots/requestPayrollReopen.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/payroll/snapshots/requestPayrollReopen.js:51 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/permissions/checkPermission.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/permissions/checkPermission.js:25 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | lib/permissions/checkPermission.js:25 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenant_id) |
| ERROR | NO_TENANT | lib/platform/security/requireOrganizationAccess.js:20 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id, |
| ERROR | NO_TENANT | lib/platform/security/requireOrganizationAccess.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/platform/security/requireOrganizationAccess.js:54 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: resolvedOrganizationId, |
| ERROR | NO_TENANT | lib/platform/security/requireOrganizationAccess.js:19 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/platform/security/requireOrganizationAccess.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId \|\| |
| ERROR | NO_TENANT | lib/platform/security/requireOrganizationAccess.js:53 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId: resolvedOrganizationId, |
| WARNING | POSSIBLE_UBTE_BYPASS | lib/platform/service-runtime/execution/ServiceExecutionRuntime.js:1 | Service execution reference found without a visible UBTE/capability execution boundary. | ServiceExecutionRuntime.js |
| WARNING | POSSIBLE_UBTE_BYPASS | lib/platform/service-runtime/index.js:1 | Service execution reference found without a visible UBTE/capability execution boundary. | index.js |
| WARNING | POSSIBLE_UBTE_BYPASS | lib/platform/service-runtime/providers/ProviderExecutor.js:1 | Service execution reference found without a visible UBTE/capability execution boundary. | ProviderExecutor.js |
| WARNING | POSSIBLE_UBTE_BYPASS | lib/platform/service-runtime/providers/ProviderResolver.js:1 | Service execution reference found without a visible UBTE/capability execution boundary. | ProviderResolver.js |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/platform/service-runtime/providers/openai/OpenAIProvider.js:1 | OpenAI is used outside the Service Provider layer. | import OpenAI from "openai"; |
| ERROR | DIRECT_PROVIDER_BYPASS | lib/platform/service-runtime/providers/openai/OpenAIProvider.js:5 | OpenAI is used outside the Service Provider layer. | new OpenAI({ |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | lib/platform/service-runtime/providers/openai/OpenAIProvider.js:8 | Provider credentials are accessed outside the Service Provider layer. | process.env.OPENAI_API_KEY, |
| ERROR | PROVIDER_CREDENTIAL_BYPASS | lib/platform/workspaces/generateWorkspaceNarrative.js:31 | Provider credentials are accessed outside the Service Provider layer. | if (!process.env.OPENAI_API_KEY) { |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | `tenant_id=eq.${tenantId}`, |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:61 | Legacy tenant context found. Use organization_id and entity_id where required. | `tenant_id=eq.${tenantId}`, |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:89 | Legacy tenant context found. Use organization_id and entity_id where required. | `tenant_id=eq.${tenantId}`, |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:117 | Legacy tenant context found. Use organization_id and entity_id where required. | `tenant_id=eq.${tenantId}`, |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:12 | Legacy tenant context found. Use organization_id and entity_id where required. | throw new Error('tenantId required') |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | `restaurant-live-${tenantId}` |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | `tenant_id=eq.${tenantId}`, |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:61 | Legacy tenant context found. Use organization_id and entity_id where required. | `tenant_id=eq.${tenantId}`, |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:89 | Legacy tenant context found. Use organization_id and entity_id where required. | `tenant_id=eq.${tenantId}`, |
| ERROR | NO_TENANT | lib/realtime/kitchenRealtimeChannel.js:117 | Legacy tenant context found. Use organization_id and entity_id where required. | `tenant_id=eq.${tenantId}`, |
| ERROR | NO_TENANT | lib/runtime/core/createEnterpriseRuntime.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/runtime/core/createEnterpriseRuntime.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | `enterprise-runtime-${tenantId}` |
| ERROR | NO_TENANT | lib/runtime/core/createEnterpriseRuntime.js:47 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/runtime/core/processEnterpriseRuntimeEvent.js:3 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/runtime/core/processEnterpriseRuntimeEvent.js:14 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/runtime/core/processEnterpriseRuntimeEvent.js:24 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:29 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:40 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:51 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:61 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:71 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:108 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:41 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:52 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:62 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:72 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/runtime/realtime/createRuntimeSnapshot.js:109 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/runtime/replay/replayEvents.js:30 | Legacy tenant context found. Use organization_id and entity_id where required. | 'tenant_id', |
| ERROR | NO_TENANT | lib/runtime/replay/replayEvents.js:11 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/runtime/replay/replayEvents.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/settings/loadOperationalSettings.js:26 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/settings/loadOperationalSettings.js:8 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/settings/loadOperationalSettings.js:27 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/settings/saveOperationalSettings.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/settings/saveOperationalSettings.js:21 | Legacy tenant context found. Use organization_id and entity_id where required. | onConflict: "tenant_id,domain", |
| ERROR | NO_TENANT | lib/settings/saveOperationalSettings.js:5 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/settings/saveOperationalSettings.js:16 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: tenantId, |
| ERROR | NO_TENANT | lib/shared/api/createDynamicRoute.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = req.nextUrl.searchParams.get('tenantId'); |
| ERROR | NO_TENANT | lib/shared/api/createDynamicRoute.js:31 | Legacy tenant context found. Use organization_id and entity_id where required. | const tenantId = req.nextUrl.searchParams.get('tenantId'); |
| ERROR | NO_TENANT | lib/shared/api/createDynamicRoute.js:33 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | lib/shared/api/createDynamicRoute.js:37 | Legacy tenant context found. Use organization_id and entity_id where required. | message: "tenantId required" |
| ERROR | NO_TENANT | lib/shared/api/createDynamicRoute.js:42 | Legacy tenant context found. Use organization_id and entity_id where required. | return { tenantId }; |
| ERROR | NO_TENANT | lib/staff/loadStaffPerformance.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/staff/loadStaffPerformance.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenant_id) { |
| ERROR | NO_TENANT | lib/staff/loadStaffPerformance.js:17 | Legacy tenant context found. Use organization_id and entity_id where required. | "tenant_id", |
| ERROR | NO_TENANT | lib/staff/loadStaffPerformance.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id |
| ERROR | NO_TENANT | lib/work-centers/getWorkCenterOrders.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/work-centers/getWorkCenterOrders.js:4 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId, |
| ERROR | NO_TENANT | lib/work-centers/getWorkCenterOrders.js:7 | Legacy tenant context found. Use organization_id and entity_id where required. | if (!tenantId) { |
| ERROR | NO_TENANT | lib/work-centers/getWorkCenterOrders.js:10 | Legacy tenant context found. Use organization_id and entity_id where required. | error: "Missing tenantId", |
| ERROR | NO_TENANT | lib/work-centers/getWorkCenterOrders.js:18 | Legacy tenant context found. Use organization_id and entity_id where required. | .eq("tenant_id", tenantId) |
| ERROR | NO_TENANT | lib/work-centers/getWorkCenterOrders.js:39 | Legacy tenant context found. Use organization_id and entity_id where required. | tenantId |
| ERROR | NO_TENANT | lib/workers/work-centers/processWorkCenterEvents.js:165 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: event.tenant_id, |
| ERROR | NO_TENANT | lib/workers/work-centers/processWorkCenterEvents.js:165 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: event.tenant_id, |
| ERROR | NO_TENANT | lib/workers/work-centers/processWorkCenterEvents.js:182 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: event.tenant_id, |
| ERROR | NO_TENANT | lib/workers/work-centers/processWorkCenterEvents.js:182 | Legacy tenant context found. Use organization_id and entity_id where required. | tenant_id: event.tenant_id, |
