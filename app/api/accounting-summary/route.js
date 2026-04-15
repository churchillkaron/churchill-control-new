import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function GET() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  const start = firstDay.toISOString().split('T')[0];
  const end = today.toISOString().split('T')[0];

  // DAILY REPORTS (sales + food cost)
  const { data: reports } = await supabase
    .from('daily-reports')
    .select('*')
    .gte('date', start)
    .lte('date', end);

  // EXPENSES
  const { data: expenses } = await supabase
    .from('accounting-expenses')
    .select('*')
    .gte('date', start)
    .lte('date', end);

  const revenue = reports?.reduce((sum, r) => sum + Number(r.revenue || 0), 0) || 0;
  const cost = reports?.reduce((sum, r) => sum + Number(r.cost || 0), 0) || 0;
  const profit = reports?.reduce((sum, r) => sum + Number(r.profit || 0), 0) || 0;

  const extraExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;

  const netProfit = profit - extraExpenses;

  return Response.json({
    revenue,
    cost,
    grossProfit: profit,
    expenses: extraExpenses,
    netProfit,
  });
}