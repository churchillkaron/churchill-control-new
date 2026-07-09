# AVANTIQO SYSTEM RULES (HARD LOCK)

## 1. Execution
- ONLY UBTE can execute capabilities
- No runtime engines allowed

## 2. Billing
- ALL billable actions go through WalletRuntime
- No bypass allowed

## 3. Architecture
- No ProviderRegistry systems
- No SaaS reactor systems
- No custom runtime engines

## 4. Source of Truth
- Execution → UBTE
- Money → WalletRuntime
- Structure → ERP_REGISTRY

## 5. Forbidden
- Any new runtime layer
- Any provider abstraction system
- Any execution router outside UBTE
