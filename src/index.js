import express from "express"
import http from "http"
import cors from "cors"
import { Server } from "socket.io"
import mongoose from "mongoose"

// CONSTANTS
const PORT = 4000

// SERVER
const app = express()
app.use(cors)
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})
app.io = io

// MONGO STUFF
let primary = mongoose.createConnection("mongodb://localhost:27017/codesdb", {
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

const Room = primary.model(
  "Room",
  {
    name: { type: String },
    host: { type: String },
    player: { type: String },
    peerHost: { type: String },
    peerPath: { type: String },
    peerPort: { type: String },
    socketURL: { type: String },
  },
  "codes"
)
const PrimaryUser = primary.model(
  "User",
  {
    _id: String,
    type: String,
    streamerName: String,
    gameName: String,
    attributes: {
      kills: Number,
      placement: Number,
    },
    active: Boolean,
  },
  "users"
)
const PrimaryTeam = primary.model(
  "Team",
  {
    name: String,
    createdBy: String,
    players: [String],
  },
  "teams"
)

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
  // initialize
  console.log(socket.handshake.auth.userId)
  console.log(socket.handshake.auth.roomcode)
  Room.findOne({ name: socket.handshake.auth.roomcode }).then((data) => {
    if (!data) {
      socket.disconnect()
    } else {
      PrimaryUser.find({
        _id: { $ne: socket.handshake.auth.userId },
        active: true,
      }).then((users) => {
        PrimaryTeam.find().then((teams) => {
          socket.emit("connected-init", {
            users: users,
            teams: teams,
            eventSettings: {
              timeout: 2000,
            },
          })
        })
      })
    }
  })
  // save to DB
  PrimaryUser.findOne({ _id: socket.handshake.auth.userId }).then((data) => {
    if (data) {
      PrimaryUser.findOneAndUpdate(
        {
          _id: socket.handshake.auth.userId,
        },
        {
          active: true,
        }
      )
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
    }
  })

  // Server Recieves
  socket.on("submit-add-team", (data) => {
    // save to mongo
    // broadcast to all
  })
  socket.on("submit-del-team", (data) => {
    // delete from mongo
    // broadcast to all
  })
  socket.on("update-user", (data) => {
    // save to mongo
    // broadcast add-user to all
  })
  socket.on("change-remote-mute", (data) => {
    socket.broadcast.emit(data)
  })

  // Watch Mongo

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
    ).then(() => {})
    io.emit("user-disconnected", { socketID: socket.id })
  })
})

// SERVER LISTEN

server.listen(PORT, () => {
  console.log(`listening on port ${PORT}`)
})
