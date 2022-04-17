import express from "express"
import http from "http"
import cors from "cors"
import { Server } from "socket.io"
import mongoose from "mongoose"

// CONSTANTS
let PORT = 80
let MONGO_PATH = "mongodb://172.31.91.101:27017/monday"
let PATH = "/api/stepbrother/socket.io"
if (process.env.NODE_ENV !== "production") {
  PORT = 4000
  MONGO_PATH = "mongodb://localhost:27017/codesdb"
  PATH = ""
}

// SERVER
const app = express()

if (process.env.NODE_ENV !== "production") {
  app.use(cors)
}
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  path: PATH,
})
app.io = io

// MONGO STUFF
let primary = mongoose.createConnection(MONGO_PATH, {
  useNewUrlParser: true,
})
// let repl = mongoose.createConnection("repl", { useNewUrlParser: true })

// const Event = repl.model(
//   "Events",
//   {
//     _id: String,
//     team: String,
//     event: String,
//   },
//   "viewer-events"
// )

const Room = primary.model("room", {
  name: { type: String },
  host: { type: String },
  player: { type: String },
})
const PrimaryUser = primary.model("user", {
  _id: String,
  type: String,
  streamerName: String,
  gameName: String,
  attributes: {
    kills: Number,
    placement: Number,
  },
  active: Boolean,
})
const PrimaryTeam = primary.model("team", {
  name: String,
  createdBy: String,
  players: [String],
})

// Event.watch().on("change", (data) => {
//   console.log(data)
//   // io.emit("viewer-event", data)
// })

///////////////////////////////////////////////////////////////////
// Socket Setup
//   Server Recieves
//     submit-add-team
//     submit-del-team
//     update-user
//     change-mute
//   Server Sends
//     connected-as
//     add-user
//     delete-user
//     change-remote-mute
//     add-team
//     delete-team
//     viewer-event-mute
///////////////////////////////////////////////////////////////////

io.on("connection", (socket) => {
  // save to DB
  PrimaryUser.findOne({ _id: socket.handshake.auth.userId })
    .then((data) => {
      if (data) {
        PrimaryUser.findOneAndUpdate(
          {
            _id: socket.handshake.auth.userId,
          },
          {
            active: true,
          }
        ).then(() => {
          PrimaryUser.findOne({ _id: socket.handshake.auth.userId }).then(
            (res) => {
              socket.broadcast.emit("add-user", {
                id: res._id,
                type: res.type,
                streamerName: res.streamerName,
                gameName: res.gameName,
                attributes: res.attributes,
                test: "test",
              })
              socket.emit("update-self", {
                streamerName: res.streamerName,
                gameName: res.gameName,
                attributes: res.attributes,
              })
            }
          )
        })
      } else {
        const newUser = new PrimaryUser({
          _id: socket.handshake.auth.userId,
          type: socket.handshake.auth.type,
          streamerName: "",
          gameName: "",
          attributes: {
            kills: 0,
            placement: 0,
          },
          active: true,
        })
        newUser.save()
        socket.broadcast.emit("add-user", {
          id: socket.handshake.auth.userId,
          type: socket.handshake.auth.type,
          streamerName: "",
          gameName: "",
          attributes: {
            kills: 0,
            placement: 0,
          },
        })
      }
    })
    .then(() => {
      // initialize
      Room.findOne({ name: socket.handshake.auth.roomcode }).then((data) => {
        if (!data) {
          socket.disconnect()
        } else {
          PrimaryUser.find({
            _id: { $ne: socket.handshake.auth.userId },
            active: true,
          })
            .then((users) => {
              PrimaryTeam.find()
                .then((teams) => {
                  socket.emit("connected-init", {
                    users: users,
                    teams: teams,
                    eventSettings: {
                      timeout: 2000,
                    },
                  })
                })
                .catch((err) => console.log(err))
            })
            .catch((err) => console.log(err))
        }
      })
      socket.join(socket.handshake.auth.userId)
    })

  // Server Recieves
  socket.on("submit-add-team", (data) => {
    const newTeam = new PrimaryTeam({
      name: data.name,
      createdBy: data.createdBy,
      players: data.players,
    })
    newTeam
      .save()
      .then((res) => {
        socket.broadcast.emit("add-team", res)
      })
      .catch((err) => console.log(err))
  })
  socket.on("submit-del-team", (data) => {
    PrimaryTeam.deleteOne({ name: data.name })
      .then((res) => {
        if (res.acknowledged) {
          socket.broadcast.emit("delete-team", { name: data.name })
        }
      })
      .catch((err) => console.log(err))
  })
  socket.on("submit-update-team", (data) => {
    PrimaryTeam.findOneAndUpdate(
      { name: data.name },
      {
        createdBy: data.createdBy,
        players: data.players,
      }
    ).then(() => {
      PrimaryTeam.findOne({ name: data.name }).then((res) => {
        socket.broadcast.emit("update-team", {
          name: data.name,
          createdBy: data.createdBy,
          players: data.players,
        })
      })
    })
  })
  socket.on("update-user", (data) => {
    PrimaryUser.findOneAndUpdate(
      {
        _id: data.playerId,
      },
      {
        streamerName: data.streamerName,
        gameName: data.gameName,
      }
    ).then(() => {
      PrimaryUser.findOne({ _id: data.playerId }).then((res) => {
        socket.broadcast.emit("add-user", {
          id: res._id,
          type: res.type,
          streamerName: res.streamerName,
          gameName: res.gameName,
          attributes: res.attributes,
        })
      })
    })
    // broadcast add-user to all
  })
  socket.on("change-remote-mute", (data) => {
    socket.broadcast.emit("change-remote-mute", {
      remoteMute: data.remoteMute,
    })
  })

  socket.on("host-unmute", (data) => {
    socket.broadcast.emit("host-unmute", {
      hostUnmute: null,
    })
    PrimaryUser.findOne({ _id: data.id }).then((user) => {
      if (user) {
        socket.to(data.id).emit("host-unmute", {
          hostUnmute: data.hostId,
        })
      } else {
        PrimaryTeam.findOne({ name: data.id }).then((team) => {
          if (team) {
            for (let i = 0; i < team.players.length; i++) {
              console.log("sending to ", team.players[i], "from ", data.hostId)
              socket.to(team.players[i]).emit("host-unmute", {
                hostUnmute: data.hostId,
              })
            }
          }
        })
      }
    })
  })

  // File Upload
  socket.on("upload-file", (file) => {
    // process data
    //    - save to mongo (game-records collection)
    //    - update players attributes (index by gamename)
    //    - send all (io.emit) player updates (active players only)
    console.log(file)
  })

  // DISCONNECT

  socket.on("disconnect", () => {
    console.log("user disconnected ", socket.handshake.auth.userId)
    PrimaryUser.findOneAndUpdate(
      {
        _id: socket.handshake.auth.userId,
      },
      {
        active: false,
      }
    )
      .then(() => {
        io.emit("delete-user", { id: socket.handshake.auth.userId })
        PrimaryTeam.findOne({ players: socket.handshake.auth.userId }).then(
          (data) => {
            if (data) {
              let newPlayers = data.players.filter(
                (player) => player !== socket.handshake.auth.userId
              )
              PrimaryTeam.findOneAndUpdate(
                { players: socket.handshake.auth.userId },
                {
                  players: newPlayers,
                }
              ).then((res) => {
                io.emit("update-team", {
                  name: data.name,
                  createdBy: data.createdBy,
                  players: newPlayers,
                })
              })
            }
          }
        )
      })
      .catch((err) => console.log(err))
  })
})

// SERVER LISTEN

server.listen(PORT, () => {
  console.log(`listening on port ${PORT}`)
})
