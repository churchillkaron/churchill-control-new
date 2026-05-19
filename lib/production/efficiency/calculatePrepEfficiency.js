export function calculatePrepEfficiency({
  batches = [],
}) {

  const completed =
    batches.filter(
      batch =>
        batch.status ===
        'COMPLETED'
    )

  const active =
    batches.filter(
      batch =>
        batch.status ===
        'ACTIVE'
    )

  const expired =
    batches.filter(
      batch =>
        batch.status ===
        'EXPIRED'
    )

  const totalProduced =
    completed.reduce(
      (
        sum,
        batch
      ) =>
        sum +
        Number(
          batch.produced_quantity || 0
        ),
      0
    )

  const totalExpected =
    completed.reduce(
      (
        sum,
        batch
      ) =>
        sum +
        Number(
          batch.expected_quantity || 0
        ),
      0
    )

  const efficiency =
    totalExpected > 0
      ? (
          totalProduced /
          totalExpected
        ) * 100
      : 0

  return {

    completed:
      completed.length,

    active:
      active.length,

    expired:
      expired.length,

    totalProduced:
      Number(
        totalProduced.toFixed(2)
      ),

    totalExpected:
      Number(
        totalExpected.toFixed(2)
      ),

    efficiency:
      Number(
        efficiency.toFixed(2)
      ),
  }
}
