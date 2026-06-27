import {
  markOrderPaid,
} from './markOrderPaid'

export async function createPayment({
  organizationId,
  tableNumber,
  paymentMethod = 'CASH',
  cashierName = 'SYSTEM',
  paidAmount = null,
}) {

  if (!organizationId) {
    throw new Error('organizationId required')
  }

  if (!tableNumber) {
    throw new Error('tableNumber required')
  }

  return await markOrderPaid({
    organizationId,
    tableNumber,
    paymentMethod,
    cashierName,
    paidAmount,
  })
}
