export function buildExpiryAlerts(
  batches = []
) {

  const alerts = []

  const now =
    Date.now()

  batches.forEach(
    batch => {

      if (
        !batch.expires_at
      ) {
        return
      }

      const expiry =
        new Date(
          batch.expires_at
        ).getTime()

      const hoursLeft =
        (
          expiry - now
        ) / 1000 / 60 / 60

      if (
        hoursLeft <= 0
      ) {

        alerts.push({
          type:
            'EXPIRED_BATCH',

          severity:
            'CRITICAL',

          batch_id:
            batch.id,

          ingredient_id:
            batch.ingredient_id,

          hoursLeft:
            Number(
              hoursLeft.toFixed(2)
            ),
        })

      } else if (
        hoursLeft <= 24
      ) {

        alerts.push({
          type:
            'EXPIRING_SOON',

          severity:
            'HIGH',

          batch_id:
            batch.id,

          ingredient_id:
            batch.ingredient_id,

          hoursLeft:
            Number(
              hoursLeft.toFixed(2)
            ),
        })
      }
    }
  )

  return alerts
}
