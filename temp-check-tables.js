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

  const {
    data,
    error,
  } = await supabase
    .from('restaurant_tables')
    .select('*')

  console.log(data)
  console.log(error)
}

run()
