require('dotenv').config({ path: '.env.local' })

const {
  createClient,
} = require('@supabase/supabase-js')

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

async function run() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const tables = [
    'T1',
    'T2',
    'T3',
    'T4',
  ].map(table => ({
    tenant_id: tenantId,
    table_number: table,
    status: 'AVAILABLE',
    created_at: new Date().toISOString(),
  }))

  const {
    data,
    error,
  } = await supabase
    .from('restaurant_tables')
    .insert(tables)
    .select()

  console.log(data)
  console.log(error)
}

run()
