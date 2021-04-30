import io from '../socketio_server.js'
import { v4 as uuidv4 } from 'uuid'
import redis from '../redis_client.js'
import { getRoomKey, isRoomValid, addUserToRoom, removeUserFromRoom, getRoomById } from '../models/room.js'
import { promisify } from 'util'

const hsetAsync = promisify(redis.hset).bind(redis)
const getAsync = promisify(redis.get).bind(redis)
const setAsync = promisify(redis.set).bind(redis)
const delAsync = promisify(redis.del).bind(redis)

const socketPrefix = 'socket:'

function getSocketKey (socketId) {
  return socketPrefix + socketId
}

async function getConnectedRoom (socketId) {
  return await getAsync(getSocketKey(socketId))
}

function onJoin (user, roomId, position) {
  io.in(roomId).emit('user_join', {
    user: {
      username: user.username,
      profilePicture: user.profilePicture
    },
    position
  })
}

function onLeave (user, roomId) {
  io.in(roomId).emit('user_leave', user.username)
}

function onRoomChange (roomId) {
  return (isRoomOpen, newHost, userLeft) => {
    if (!isRoomOpen) {
      io.in(roomId).emit('room_closed')
      return
    }

    if (userLeft) {
      onLeave()
    }

    if (newHost) {
    // TODO: emit to clients about new host
      io.in(roomId).emit('new_host', newHost)
    }
  }
}

function getRandomNum (min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

io.on('connection', socket => {
  const req = socket.request

  socket.on('create_room', async (data, ackcb) => {
    if (req.isUnauthenticated()) {
      return ackcb({ success: false })
    }

    const id = uuidv4()

    const { name, description, private: privateRoom, genres } = data

    const host = {
      username: req.user.username,
      profilePicture: req.user.profilePicture
    }
    const numMembers = '1'
    const members = {}
    const queue = []
    const currentSong = 'null'

    members[req.user.username] = {
      joined: 1,
      username: req.user.username,
      profilePicture: req.user.profilePicture,
      position: {
        x: getRandomNum(0, 300),
        y: getRandomNum(0, 300)
      }
    }

    const room = {
      id,
      name,
      description,
      privateRoom: privateRoom,
      genres,
      host,
      numMembers,
      members,
      queue,
      currentSong
    }

    await hsetAsync(
      getRoomKey(id),
      'id', id,
      'name', name,
      'description', description,
      'private', privateRoom,
      'genres', genres.join(),
      'numMembers', numMembers,
      'json', JSON.stringify(room)
    )

    socket.join(id)
    await setAsync(getSocketKey(socket.id), id)
    ackcb({ success: true, room })
  })

  socket.on('join_room', async (roomId, ackcb) => {
    if (!(await isRoomValid(roomId))) {
      return ackcb({ success: false })
    }

    const room = await getConnectedRoom(socket.id)

    // probably the host joining the room after creation, do not do anything
    if (room) {
      return ackcb({ success: true, room: room })
    }

    // set in redis
    await setAsync(getSocketKey(socket.id), roomId)

    socket.join(roomId)

    if (req.isUnauthenticated()) {
      return ackcb({ success: true, room: getRoomById(roomId) })
    }

    const updatedRoom = await addUserToRoom(req.user, roomId, onJoin)

    ackcb({ success: true, room: updatedRoom })
  })

  socket.on('leave_room', async () => {
    const roomId = await getConnectedRoom(socket.id)

    // never joined room
    if (!roomId) {
      return
    }

    socket.leave(roomId)
    // remove in redis
    await delAsync(getSocketKey(socket.id))
    await removeUserFromRoom(req.user, roomId, onRoomChange(roomId))
  })

  socket.on('disconnecting', async () => {
    const roomId = await getConnectedRoom(socket.id)

    if (!roomId) {
      return
    }

    // remove in redis
    await delAsync(getSocketKey(socket.id))
    await removeUserFromRoom(req.user, roomId, onRoomChange(roomId))
  })
})
