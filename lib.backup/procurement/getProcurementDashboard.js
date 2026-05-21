import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getProcurementDashboard() {

  const [
    ingredients,
    purchaseOrders,
    invoices,
    suppliers,
  ] = await Promise.all([

    supabaseAdmin
      .from('ingredients')
      .select('*'),

    supabaseAdmin
      .from(
        'production_purchase_orders'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'production_supplier_invoices'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'ingredient_suppliers'
      )
      .select('*'),
  ])

  const lowStock =
    (ingredients.data || [])
      .filter(
        ingredient =>
          Number(
            ingredient.stock || 0
          ) <= Number(
            ingredient.minimum_stock || 0
          )
      )

  const pendingPO =
    (purchaseOrders.data || [])
      .filter(
        po =>
          po.status !==
          'RECEIVED'
      )

  const pendingInvoices =
    (invoices.data || [])
      .filter(
        invoice =>
          invoice.status !==
          'APPROVED'
      )

  return {

    lowStock,

    pendingPO,

    pendingInvoices,

    totalSuppliers:
      (suppliers.data || [])
        .length,
  }
}
