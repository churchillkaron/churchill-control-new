export async function financeHandler(
  payload
) {

  console.log(
    'Finance handler executed',
    payload
  )

  /*
  |--------------------------------------------------------------------------
  | Future Logic
  |--------------------------------------------------------------------------
  |
  | 1. Create sales journal
  | 2. Create COGS journal
  | 3. Update revenue accounts
  | 4. Update cash/bank
  |
  */

  return {
    module: 'finance',
    success: true,
  }
}
