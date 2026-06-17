#!/bin/bash

echo "STEP 1: Check Journal Engine"
grep -R "createJournalEntry" lib/finance
grep -R "postJournalToLedger" lib/finance

echo "STEP 2: Test Asset Depreciation Flow"
node -e "
import { runAssetDepreciation } from './lib/finance/core/runAssetDepreciation.js';
(async () => {
  const test = await runAssetDepreciation({ tenantId: 'TEST_TENANT', assetId: 'TEST_ASSET', depreciationDate: '2026-06-11' });
  console.log('Asset Depreciation Test:', test);
})();
"

echo "STEP 3: Test Customer Invoice Flow"
node -e "
import { createCustomerInvoice } from './lib/finance/core/createCustomerInvoice.js';
(async () => {
  const test = await createCustomerInvoice({ tenantId: 'TEST_TENANT', customerName: 'Test Customer', invoiceNumber: 'INV-001', invoiceDate: '2026-06-11', dueDate: '2026-06-18', invoiceAmount: 1000 });
  console.log('Customer Invoice Test:', test);
})();
"

echo "STEP 4: Test Customer Payment Flow"
node -e "
import { processCustomerPayment } from './lib/finance/core/processCustomerPayment.js';
(async () => {
  const test = await processCustomerPayment({ tenantId: 'TEST_TENANT', invoiceId: 'TEST_INVOICE', paymentReference: 'PAY-001', paymentAmount: 500, paymentMethod: 'CASH' });
  console.log('Customer Payment Test:', test);
})();
"

echo "STEP 5: Test Day Close Flow"
node -e "
import { runDayClosedFlow } from './lib/orchestration/runDayClosedFlow.js';
(async () => {
  const result = await runDayClosedFlow({ tenantId: 'TEST_TENANT' });
  console.log('Day Close Execution Steps:', result.executionSteps);
})();
"

echo "STEP 6: Verify Reporting"
grep -R "general_ledger" lib/finance/reports
grep -R "journal_entries" lib/finance/reports

echo "Full Finance Verification Complete"
