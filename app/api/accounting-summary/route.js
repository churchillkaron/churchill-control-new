import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // ✅ FIXED TABLE NAME
    const { data: salesData, error } = await supabase
      .from('pos_sales')
      .select('*');

    if (error) throw error;

    let revenue = 0;
    let sales = 0;
    let drinks = 0;

    (salesData || []).forEach((sale) => {
      revenue += Number(sale.total || 0);
      sales += 1;

      try {
        // ✅ SAFE JSON PARSE
        const items = sale.items
          ? (typeof sale.items === 'string'
              ? JSON.parse(sale.items)
              : sale.items)
          : [];

        (items || []).forEach((item) => {
          const name = (item.name || '').toLowerCase();
          const price = Number(item.price || 0);

          // simple drink detection
          if (
            name.includes('beer') ||
            name.includes('wine') ||
            name.includes('cocktail') ||
            name.includes('drink') ||
            name.includes('cola') ||
            name.includes('water')
          ) {
            drinks += price;
          }
        });
      } catch (e) {
        // ignore broken items
      }
    });

    const avg = sales > 0 ? revenue / sales : 0;
    const drinksPerSale = sales > 0 ? drinks / sales : 0;

    // ---- AI LOGIC ----
    let score = 100;
    const issues = [];

    if (avg < 400) {
      score -= 25;
      issues.push('Low ticket size — upsell failure');
    }

    if (drinksPerSale < 120) {
      score -= 25;
      issues.push('Drinks-first weak — push drinks immediately');
    }

    if (drinksPerSale < 80) {
      score -= 30;
      issues.push('Critical: drink conversion failing');
    }

    let status = 'GOOD';
    if (score < 40) status = 'CRITICAL';
    else if (score < 60) status = 'BAD';
    else if (score < 80) status = 'WARNING';

    const base = revenue * 0.05;

    let multiplier = 1;
    let decision = 'Full service charge approved';

    if (status === 'WARNING') {
      multiplier = 0.7;
      decision = 'Reduced service charge';
    }

    if (status === 'BAD') {
      multiplier = 0.4;
      decision = 'Low service charge';
    }

    if (status === 'CRITICAL') {
      multiplier = 0;
      decision = 'No service charge';
    }

    const serviceCharge = base * multiplier;

    const split = {
      foh: serviceCharge * 0.5,
      bar: serviceCharge * 0.3,
      kitchen: serviceCharge * 0.2,
    };

    return new Response(
      JSON.stringify({
        revenue,
        sales,
        avg,
        drinks,
        ai: {
          score,
          status,
          issues,
          decision,
          serviceCharge,
          split,
        },
      }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}