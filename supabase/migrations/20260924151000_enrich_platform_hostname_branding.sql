update public.organization_channel_assets
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
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
), updated_at=now()
where channel_provider='avantiqo' and asset_type='platform_hostname' and external_id='app.churchillkaron.com'
  and organization_id='33336a72-acb5-474e-856b-8be0269360e2'::uuid;

update public.organization_channel_assets
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
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
), updated_at=now()
where channel_provider='avantiqo' and asset_type='platform_hostname' and external_id='coleley.com'
  and organization_id='9550b843-b83c-4d15-b02d-a0b5ca23346e'::uuid;
