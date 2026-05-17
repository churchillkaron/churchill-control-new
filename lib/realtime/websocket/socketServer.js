import { Server } from "socket.io";

const globalForSocket =
  global;

if (
  !globalForSocket.__churchillSocket
) {

  globalForSocket.__churchillSocket = {

    io: null,

    initialized: false,
  };
}

const socketState =
  globalForSocket.__churchillSocket;

export function initializeSocket(server) {

  if (
    socketState.initialized
  ) {

    return socketState.io;
  }

  const io =
    new Server(server, {

      path:
        "/api/realtime/ws",

      cors: {

        origin: "*",
      },
    });

  io.on(
    "connection",
    (socket) => {

      console.log(
        "SOCKET_CONNECTED",
        socket.id
      );

      socket.on(
        "join-room",
        (room) => {

          socket.join(
            room
          );

          io.to(room).emit(
            "presence-update",
            {

              user:
                socket.id,

              room,

              type:
                "JOINED",
            }
          );
        }
      );

      socket.on(
        "executive-event",
        (payload) => {

          io.emit(
            "executive-stream",
            {

              ...payload,

              created_at:
                new Date().toISOString(),
            }
          );
        }
      );

      socket.on(
        "disconnect",
        () => {

          console.log(
            "SOCKET_DISCONNECTED",
            socket.id
          );
        }
      );
    }
  );

  socketState.io =
    io;

  socketState.initialized =
    true;

  return io;
}

export default socketState;
