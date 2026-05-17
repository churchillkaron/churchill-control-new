const globalForPresence =
  global;

if (
  !globalForPresence.__churchillPresence
) {

  globalForPresence.__churchillPresence = {

    users: {},

    heartbeat(
      userId,
      metadata = {}
    ) {

      this.users[userId] = {

        ...metadata,

        userId,

        online: true,

        updated_at:
          new Date().toISOString(),
      };
    },

    offline(userId) {

      if (
        this.users[userId]
      ) {

        this.users[
          userId
        ].online = false;

        this.users[
          userId
        ].updated_at =
          new Date().toISOString();
      }
    },

    all() {

      return Object.values(
        this.users
      );
    },
  };
}

const presenceManager =
  globalForPresence.__churchillPresence;

export default presenceManager;
