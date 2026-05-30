ALTER TABLE public.pos_orders
ADD COLUMN IF NOT EXISTS production_processed boolean DEFAULT false;

ALTER TABLE public.pos_orders
ADD COLUMN IF NOT EXISTS production_processed_at timestamptz;
