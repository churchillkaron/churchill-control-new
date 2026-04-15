export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()

    if (!supabase) {
      return NextResponse.json({
        revenue: 0,
        sales: 0,
        avg: 0,
      })
    }

    const { data, error } = await supabase
      .from('pos-sales')
      .select('*')

    if (error) {
      console.error(error)
      return NextResponse.json({ revenue: 0, sales: 0, avg: 0 })
    }

    let revenue = 0
    let drinks = 0
    let itemsSold = 0

    data.forEach((sale) => {
      revenue += Number(sale.total || 0)

      if (Array.isArray(sale.items)) {
        sale.items.forEach((item) => {
          itemsSold += Number(item.qty || 1)

          // 🔥 detect drinks
          if (item.category === "drink") {
            drinks += Number(item.price || 0) * Number(item.qty || 1)
          }
        })
      }
    })

    const sales = data.length
    const avg = sales ? revenue / sales : 0

    return NextResponse.json({
      revenue,
      sales,
      avg,
      drinks,
      itemsSold,
    })

  } catch (err) {
    console.error(err)
    return NextResponse.json({
      revenue: 0,
      sales: 0,
      avg: 0,
      drinks: 0,
      itemsSold: 0,
    })
  }
}