ALTER TABLE pos_orders
ADD COLUMN subtotal numeric DEFAULT 0,
ADD COLUMN service_charge numeric DEFAULT 0,
ADD COLUMN tax numeric DEFAULT 0,
ADD COLUMN discount numeric DEFAULT 0,
ADD COLUMN final_amount numeric DEFAULT 0;

-- Initialize subtotal and final_amount with existing total for backwards compatibility
UPDATE pos_orders
SET subtotal = total,
    final_amount = total;
