begin;

alter table public.market_risk_policies
  add column if not exists loss_reentry_cooloff_hours numeric(10,4) not null default 24;

alter table public.market_risk_policies
  drop constraint if exists market_risk_loss_reentry_cooloff_check;
alter table public.market_risk_policies
  add constraint market_risk_loss_reentry_cooloff_check
  check (loss_reentry_cooloff_hours >= 1 and loss_reentry_cooloff_hours <= 720);

comment on column public.market_risk_policies.loss_reentry_cooloff_hours is
  'Duration of the PAPER symbol-specific BUY lockout after the latest realized close on that symbol is a loss.';

commit;
