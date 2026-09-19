begin;

create unique index if not exists market_paper_orders_decision_unique
  on public.market_paper_orders (decision_id)
  where decision_id is not null;

comment on index public.market_paper_orders_decision_unique is
  'Enforces one PAPER order per governed market decision so retries cannot duplicate a decision mutation.';

commit;
