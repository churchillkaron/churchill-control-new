async function createPO(request) {
  // Generate a proper ERP-grade PO number
  const poNumber = await getNextPONumber(request.tenant_id);

  const total = Number(request.estimated_cost || 0);

  const { error } = await supabase
    .from("purchase_orders")
    .insert([{
      po_number: poNumber,
      purchase_request_id: request.id,
      vendor_id: request.vendor_id,
      subtotal: total,
      created_at: new Date().toISOString()
    }]);

  if (error) throw error;

  return poNumber;
}

// Example placeholder function for sequential PO generation
async function getNextPONumber(tenantId) {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("po_number")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const lastNumber = data?.po_number?.match(/\d+$/)?.[0] || "0";
  const nextNumber = String(Number(lastNumber) + 1).padStart(6, "0");
  return `PO-${nextNumber}`;
}
