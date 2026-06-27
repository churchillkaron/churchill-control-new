export function buildStationLoadMetrics({
  sessions = [],
  prep_batches = [],
}) {

  const stations = {}

  sessions.forEach(
    session => {

      const station =
        session.station ||
        'GENERAL'

      if (
        !stations[station]
      ) {

        stations[station] = {

          station,

          active_sessions: 0,

          completed_sessions: 0,

          active_batches: 0,

          load_level:
            'LOW',
        }
      }

      if (
        session.status ===
        'ACTIVE'
      ) {

        stations[
          station
        ].active_sessions += 1

      } else {

        stations[
          station
        ].completed_sessions += 1
      }
    }
  )

  prep_batches.forEach(
    batch => {

      const station =
        batch.station ||
        'GENERAL'

      if (
        !stations[station]
      ) {

        stations[station] = {

          station,

          active_sessions: 0,

          completed_sessions: 0,

          active_batches: 0,

          load_level:
            'LOW',
        }
      }

      if (
        batch.status ===
        'ACTIVE'
      ) {

        stations[
          station
        ].active_batches += 1
      }
    }
  )

  Object.values(
    stations
  ).forEach(
    station => {

      const load =
        station.active_sessions +
        station.active_batches

      if (load >= 15) {

        station.load_level =
          'CRITICAL'

      } else if (
        load >= 10
      ) {

        station.load_level =
          'HIGH'

      } else if (
        load >= 5
      ) {

        station.load_level =
          'MEDIUM'
      }
    }
  )

  return Object.values(
    stations
  )
}
