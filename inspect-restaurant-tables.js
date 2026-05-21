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
    .limit(1)

  console.log(
    'DATA:',
    data
  )

  console.log(
    'ERROR:',
    error
  )

  if (
    data &&
    data.length > 0
  ) {

    console.log(
      'COLUMNS:',
      Object.keys(data[0])
    )
  }
}

run()
