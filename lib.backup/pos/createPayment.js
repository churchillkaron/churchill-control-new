import {
  markOrderPaid,
} from './markOrderPaid'

export async function createPayment({
  tenantId,
  tableNumber,
  paymentMethod = 'CASH',
  cashierName = 'SYSTEM',
  paidAmount = null,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!tableNumber) {
    throw new Error('tableNumber required')
  }

  return await markOrderPaid({
    tenantId,
    tableNumber,
    paymentMethod,
    cashierName,
    paidAmount,
  })
}
