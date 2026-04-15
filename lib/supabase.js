import { createClient } from '@supabase/supabase-js'

let supabase = null

export function getSupabase() {
  if (supabase) return supabase

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  // 🔥 DO NOT THROW (THIS WAS BREAKING BUILD)
  if (!url || !key) {
    console.warn('Supabase env missing — returning null client')
    return null
  }

  supabase = createClient(url, key)
  return supabase
}