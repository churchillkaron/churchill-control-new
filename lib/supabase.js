import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

// Do NOT throw error at build time
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing at build/runtime')
}

const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
)

export default supabase