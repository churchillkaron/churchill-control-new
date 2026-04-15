import { NextResponse } from 'next/server';
import supabase from '@/lib/supabase';

export async function POST(request) {
  try {
    const body = await request.json();

    const { date, dishes, revenue, cost, profit } = body;

    const { error } = await supabase
      .from('daily-reports')
      .insert([
        {
          date,
          dishes,
          revenue,
          cost,
          profit,
        },
      ]);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}