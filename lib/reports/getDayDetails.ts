import { supabase } from '@/lib/supabaseClient'

export async function getDayDetails(batchId: string) {
  // 1. Get batch
  const { data: batch, error: batchError } = await supabase
    .from('daily_sales_batches')
    .select('*')
    .eq('id', batchId)
    .single()

  if (batchError) throw batchError

  // 2. Get sales items
  const { data: items, error: itemsError } = await supabase
    .from('daily_sales_items')
    .select(`
      id,
      quantity,
      dish_id,
      dishes(name)
    `)
    .eq('batch_id', batchId)

  if (itemsError) throw itemsError

  // 3. Get inventory movements for that day
  const { data: movements, error: movementError } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('type', 'sales')
    .gte('created_at', batch.created_at)
    .lte('created_at', batch.created_at)

  if (movementError) throw movementError

  return {
    batch,
    items,
    movements
  }
}