import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// GET → fetch all expenses
export async function GET() {
  const { data, error } = await supabase
    .from('accounting-expenses')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

// POST → add new expense
export async function POST(req) {
  const body = await req.json();

  const { date, category, description, amount, payment_method, supplier } = body;

  const { data, error } = await supabase
    .from('accounting-expenses')
    .insert([
      {
        date,
        category,
        description,
        amount,
        payment_method,
        supplier,
      },
    ]);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
