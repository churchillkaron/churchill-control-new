const globalForChannels =
  global;

if (
  !globalForChannels.__churchillChannels
) {

  globalForChannels.__churchillChannels = {

    channels: {},

    join(
      channel,
      clientId
    ) {

      if (
        !this.channels[
          channel
        ]
      ) {

        this.channels[
          channel
        ] = new Set();
      }

      this.channels[
        channel
      ].add(clientId);

      return true;
    },

    leave(
      channel,
      clientId
    ) {

      if (
        !this.channels[
          channel
        ]
      ) {
        return;
      }

      this.channels[
        channel
      ].delete(
        clientId
      );
    },

    list(channel) {

      return Array.from(
        this.channels[
          channel
        ] || []
      );
    },
  };
}

const channelManager =
  globalForChannels.__churchillChannels;

export default channelManager;
