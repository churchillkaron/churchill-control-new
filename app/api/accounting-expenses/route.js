import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// GET (with optional date filter)
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');

  let query = supabase
    .from('accounting-expenses')
    .select('*')
    .order('date', { ascending: false });

  if (start) {
    query = query.gte('date', start);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

// POST
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