import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function recalculateOrderTotals(orderId) {
  const taxRate = 7;
  const serviceChargeRate = 5;

  const { data: items, error: itemError } = await supabaseAdmin
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .not("status", "eq", "VOIDED");

  if (itemError) throw itemError;

  const subtotal = (items || []).reduce(
    (sum, item) =>
      sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const discount = 0;

  const tax = subtotal * (taxRate / 100);
  const serviceCharge = subtotal * (serviceChargeRate / 100);
  const finalAmount = subtotal + tax + serviceCharge - discount;

  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({
      subtotal: Number(subtotal.toFixed(2)),
      service_charge: Number(serviceCharge.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      final_amount: Number(finalAmount.toFixed(2)),
      total: Number(finalAmount.toFixed(2)),
      total_amount: Number(finalAmount.toFixed(2)),
    })
    .eq("id", orderId);

  if (updateError) throw updateError;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    service_charge: Number(serviceCharge.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    final_amount: Number(finalAmount.toFixed(2)),
  };
}
