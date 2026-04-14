export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    )

    const { data, error } = await supabase
      .from('dishes')
      .select('*')

    if (error) {
      console.log("SUPABASE ERROR:", error)
      return Response.json({ error: error.message })
    }

    return Response.json(data)

  } catch (err) {
    console.log("SERVER ERROR:", err)
    return Response.json({ error: err.message })
  }
}