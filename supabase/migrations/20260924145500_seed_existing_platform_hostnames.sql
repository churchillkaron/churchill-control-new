insert into public.organization_channel_assets (
  organization_id,
  connection_id,
  channel_provider,
  asset_type,
  external_id,
  name,
  metadata,
  selected_at,
  updated_at
)
values
  (
    '33336a72-acb5-474e-856b-8be0269360e2'::uuid,
    null,
    'avantiqo',
    'platform_hostname',
    'app.churchillkaron.com',
    'Churchill Restaurant & Bar Staff Portal',
    jsonb_build_object(
      'status','ACTIVE',
      'staff_portal',true,
      'display_name','Churchill Restaurant & Bar',
      'brand_name','Churchill Restaurant & Bar',
      'brand_id','churchill',
      'identity_label','Churchill',
      'logo_src','/branding/churchill1.png',
      'logo_alt','Churchill Restaurant & Bar',
      'logo_layout','wide',
      'tagline','Restaurant Operating System',
      'strapline','Control · Operate · Grow',
      'welcome_title','Welcome to Churchill',
      'workspace_title','Churchill Restaurant & Bar',
      'workspace_description','Restaurant operating system for operations, staff, finance, procurement, inventory, marketing and management.',
      'runtime_label','Churchill Operations Active',
      'security_label','Secure Churchill Access'
    ),
    now(),
    now()
  ),
  (
    '9550b843-b83c-4d15-b02d-a0b5ca23346e'::uuid,
    null,
    'avantiqo',
    'platform_hostname',
    'coleley.com',
    'Cole Ley Staff Portal',
    jsonb_build_object(
      'status','ACTIVE',
      'staff_portal',true,
      'display_name','Cole Ley',
      'brand_name','Cole Ley',
      'brand_id','coleley',
      'identity_label','Cole Ley',
      'logo_src','https://raw.githubusercontent.com/churchillkaron/Cole-Ley-/main/public/cole-logo1.png',
      'logo_alt','Cole Ley',
      'logo_layout','wide',
      'tagline','Artist Agency Operating System',
      'strapline','Book · Perform · Grow',
      'welcome_title','Welcome to Cole Ley',
      'workspace_title','Cole Ley Co., Ltd.',
      'workspace_description','Artist agency operating system for enquiries, bookings, contracts, schedules, show delivery, finance and management.',
      'runtime_label','Cole Ley Operations Active',
      'security_label','Secure Cole Ley Access'
    ),
    now(),
    now()
  )
on conflict (channel_provider, external_id)
do update set
  organization_id = excluded.organization_id,
  asset_type = excluded.asset_type,
  name = excluded.name,
  metadata = excluded.metadata,
  selected_at = excluded.selected_at,
  updated_at = excluded.updated_at;
