const globalForBus =
  global;

if (
  !globalForBus.__churchillRealtimeBus
) {

  globalForBus.__churchillRealtimeBus = {

    clients: new Set(),

    publish(event) {

      for (const client of this.clients) {

        try {

          client.send(
            JSON.stringify(
              event
            )
          );

        } catch (error) {

          console.error(
            "REALTIME_SEND_ERROR",
            error.message
          );
        }
      }
    },

    subscribe(client) {

      this.clients.add(
        client
      );
    },

    unsubscribe(client) {

      this.clients.delete(
        client
      );
    },
  };
}

const realtimeBus =
  globalForBus.__churchillRealtimeBus;

export default realtimeBus;
