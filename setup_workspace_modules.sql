-- Replace <ORGANIZATION_ID> with actual UUIDs for each org

-- Example: Test Hotel Alpha (all hotel modules)
INSERT INTO organization_modules (id, organization_id, module_id, status, created_at)
VALUES
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'analytics', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'crm', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'customer_portal', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'finance', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'frontdesk', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'housekeeping', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'maintenance', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'reservations', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'concierge', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'operations', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'owner_ai', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'payroll', 'ACTIVE', now()),
  (gen_random_uuid(), 'e1b970dd-b5dc-48b5-9207-cc4e23da2e91', 'marketing_ai', 'ACTIVE', now());

-- Example: Churchill Restaurant & Bar (restaurant modules)
INSERT INTO organization_modules (id, organization_id, module_id, status, created_at)
VALUES
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'analytics', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'crm', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'customer_portal', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'finance', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'hr', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'inventory', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'operations', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'owner_ai', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'payroll', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'pos', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'procurement', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'projects', 'ACTIVE', now()),
  (gen_random_uuid(), '33336a72-acb5-474e-856b-8be0269360e2', 'marketing_ai', 'ACTIVE', now());

