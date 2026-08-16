# Operations Bank Deposit Release

Released from main after database acceptance and People employee-directory audit convergence.

- Operations bank deposit lifecycle migration: 20260816051713
- Physical custody: cash location -> Deposit in Transit
- Finance confirmation: Deposit in Transit -> mapped bank ledger account
- Existing Finance bank reconciliation remains the reconciliation owner
- Real bank master data is required before production deposit submission
