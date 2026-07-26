from pathlib import Path

path = Path("app/api/creative/release/preflight/route.js")
source = path.read_text()
old = '''    const walletAvailable = number(wallet.row?.available_balance, null);
    const walletReserved = number(wallet.row?.reserved_balance, 0);
    const walletSpendable = walletAvailable === null
      ? null
      : Math.max(0, walletAvailable - walletReserved);
'''
new = '''    const walletAvailable = number(wallet.row?.available_balance, null);
    const walletReserved = number(wallet.row?.reserved_balance, 0);
    // WalletRuntime.reserve already deducts committed funds from available_balance.
    // Subtracting reserved_balance again would double-count reservations and can
    // incorrectly block otherwise affordable Creative executions.
    const walletSpendable = walletAvailable === null
      ? null
      : Math.max(0, walletAvailable);
'''
if source.count(old) != 1:
    raise SystemExit(f"EXPECTED_ONE_WALLET_LIQUIDITY_BLOCK:{source.count(old)}")
source = source.replace(old, new, 1)
old_evidence = '''      check("wallet_liquidity_sufficient", true, walletSufficient, { available_balance: walletAvailable, reserved_balance: walletReserved, spendable_balance: walletSpendable, estimated_maximum_cost: estimatedMaximumCost, currency: walletCurrency || null }),
'''
new_evidence = '''      check("wallet_liquidity_sufficient", true, walletSufficient, { available_balance: walletAvailable, reserved_balance: walletReserved, spendable_balance: walletSpendable, balance_semantics: "AVAILABLE_EXCLUDES_RESERVED", estimated_maximum_cost: estimatedMaximumCost, currency: walletCurrency || null }),
'''
if source.count(old_evidence) != 1:
    raise SystemExit(f"EXPECTED_ONE_WALLET_EVIDENCE_BLOCK:{source.count(old_evidence)}")
path.write_text(source.replace(old_evidence, new_evidence, 1))
Path("scripts/agent-creative-wallet-liquidity-patch.py").unlink()
Path(".github/workflows/agent-creative-wallet-liquidity.yml").unlink()
