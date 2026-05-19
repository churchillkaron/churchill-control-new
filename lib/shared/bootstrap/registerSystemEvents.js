import '@/lib/restaurant/events/registerRestaurantEvents'

let initialized = false

export function registerSystemEvents() {

  if (initialized) {
    return
  }

  initialized = true

  console.log(
    'Avantiqo event system initialized'
  )
}
