import express from "express"
import http from "http"
import cors from "cors"
import { Server } from "socket.io"

// CONSTANTS
const PORT = 4000
const REDIS_URL = "redis://localhost:6379"
const playerToken = "player"
const hostToken = "host"

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

// Connection stuff

// Auth
io.use((socket, next) => {
  // auth the initial connection
  if (socket.handshake.auth && socket.handshake.auth.code) {
    if (socket.handshake.auth.code === playerToken) {
      // connect as player
      socket.join("players")
      socket.emit("connected-as", "player")
      next()
    } else if (socket.handshake.auth.code === hostToken) {
      // connect as host
      socket.join("host")
      socket.emit("connected-as", "host")
      next()
    } else {
      // return auth error
      next(new Error("authentication error"))
    }
  } else {
    // return auth error
    next(new Error("authentication error"))
  }
})

// once connected
io.on("connection", (socket) => {
  // TEAM STUFF

  socket.on("ready", () => {
    socket.broadcast.emit("player-ready", { socketID: socket.id })
  })

  socket.on("set-name", (name) => {
    // emit name and socket name to all people on server
    socket.broadcast.emit("set-user-name", {
      username: name,
      socketId: socket.id,
    })
  })

  socket.on("join-team", (teamUUID, audioStream) => {
    // disconnect from any other teams (other than players and self)
    socket.join(teamUUID)
    // send audio to all in team
    socket.to(teamUUID).emit("player-joined-audio", audioStream)
    // send team-join notification to all
    socket.broadcast.emit("player-joined-team", {
      socketID: socket.id,
      teamID: teamUUID,
    })
  })

  socket.on("send-player-audio", (audioStream, socketID) => {
    socket.to(socketID).emit("join-my-audio", audioStream)
  })

  socket.on("leave-team", (teamUUID) => {
    // tell all to leave my audio
    socket.to(teamUUID).emit("disconnect-my-audio", socket.id)
    // leave team to everyone
    socket.broadcast.emit("player-left-team", {
      socketID: socket.id,
      teamID: teamUUID,
    })
  })

  socket.on("create-team", (teamName, teamUUID) => {
    // create a team with a team name and team uuid
    // send out created team to all players
    socket.broadcast.emit("team-created", {
      teamName: teamName,
      teamID: teamUUID,
    })
  })

  socket.on("delete-team", (teamUUID) => {
    // remove all players from team and delete room
    io.sockets.clients(teamUUID).forEach((s) => {
      s.leave(teamUUID)
    })

    // send out deleted team to all players
    socket.broadcast.emit("team-deleted", {
      teamID: teamUUID,
    })
  })

  // HOST STUFF

  socket.on("message-host", (msg) => {
    socket.to("host").emit("private message", socket.id, msg)
  })

  socket.on("screen-to-host", (screenStream) => {
    // send stream to host
  })

  socket.on("audio-to-host", (audioStream) => {
    // send audio to host
  })

  socket.on("randomize-teams", () => {
    // switch up all of the teams
  })

  socket.on("unmute-host-team", (teamUUID) => {
    socket.to(teamUUID).emit("unmute-me", socket.id)
  })

  socket.on("unmute-host-all", () => {
    socket.broadcast.emit("unmute-me", socket.id)
  })

  socket.on("mute-host", () => {
    socket.broadcast.emit("mute-me", socket.id)
  })

  // DISCONNECT

  socket.on("disconnect", () => {
    console.log("user disconnected")
    io.emit("user-disconnected", { socketID: socket.id })
  })
})

// SERVER LISTEN

server.listen(PORT, () => {
  console.log(`listening on port ${PORT}`)
})
