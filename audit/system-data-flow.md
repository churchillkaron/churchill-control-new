# CHURCHILL DATA FLOW

## 1. POS FLOW
UI → app/api/pos → shared/auth → shared/supabase → finance/inventory → runtime events

## 2. PROCUREMENT FLOW
UI → app/api/procurement → approvals → finance → inventory → ledger

## 3. FINANCE FLOW
UI → app/api/finance → shared/approvals → general_ledger → reporting

## 4. APPROVAL FLOW
any domain → shared/approvals → eventBus → queue → execution

## 5. AI FLOW
runtime → intelligence → shared/eventBus → recommendations → UI
