import io from '../socketio_server.js'
import { nanoid } from 'nanoid'
import redis from '../redis_client.js'
import { removeFromQueue, getQueue, deleteQueue } from '../models/queue.js'
import { getRoomKey, isRoomValid, addUserToRoom, removeUserFromRoom, getRoomById, getMessageRange } from '../models/room.js'
import { promisify } from 'util'

const hsetAsync = promisify(redis.hset).bind(redis)
const getAsync = promisify(redis.get).bind(redis)
const setAsync = promisify(redis.set).bind(redis)
const delAsync = promisify(redis.del).bind(redis)

const socketPrefix = 'socket:'

function getSocketKey (socketId) {
  return socketPrefix + socketId
}

async function getConnectedRoomId (socketId) {
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

async function onRoomClose (roomId) {
  io.in(roomId).emit('room_closed')
  await deleteQueue(roomId)

  const sockets = await io.in(roomId).fetchSockets()

  sockets.forEach(function (socket) {
    socket.leave(roomId)
  })
}

function onRoomChange (roomId) {
  return async (room, isRoomOpen, newHost, userLeft) => {
    if (!isRoomOpen) {
      return await onRoomClose(roomId)
    }

    if (userLeft) {
      onLeave(userLeft, roomId)

      console.log('user left')
      await removeFromQueue(roomId, userLeft)
    }

    if (newHost) {
      io.in(roomId).emit('new_host', newHost)
    }
  }
}

function getRandomNum (min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

function onNewSocketConnection (socket) {
  const req = socket.request

  socket.on('create_room', async (data, ackcb) => {
    if (req.isUnauthenticated()) {
      console.log('FAIL create_room', 'Unauthed user')
      return ackcb({ success: false })
    }

    const id = nanoid(10)

    const { name, description, private: privateRoom, genres } = data

    const host = {
      username: req.user.username,
      profilePicture: req.user.profilePicture
    }
    const numMembers = '1'
    const members = {}
    const queue = []
    const currentSong = null

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
    console.log(`create_room: ${room.id}`, req.user.username)
    ackcb({ success: true, room })
  })

  socket.on('join_room', async (roomId, ackcb) => {
    if (!(await isRoomValid(roomId))) {
      return ackcb({ success: false })
    }

    const connectedRoomId = await getConnectedRoomId(socket.id)

    // probably the host joining the room after creation, do not do anything
    if (connectedRoomId) {
      const room = await getRoomById(connectedRoomId)
      room.queue = await getQueue(roomId)
      return ackcb({ success: true, guest: false, room: room })
    }

    // set in redis
    await setAsync(getSocketKey(socket.id), roomId)

    socket.join(roomId)

    if (req.isUnauthenticated()) {
      const room = await getRoomById(roomId)
      room.queue = await getQueue(roomId)
      return ackcb({ success: true, guest: true, room: room })
    }

    const updatedRoom = await addUserToRoom(req.user, roomId, onJoin)
    console.log(`join_room: ${roomId}`, req.user.username)

    updatedRoom.queue = await getQueue(roomId)
    updatedRoom.messages = await getMessageRange(0, -1, roomId)

    ackcb({ success: true, guest: false, room: updatedRoom })
  })

  socket.on('pos_change', async (position) => {
    if (req.isUnauthenticated()) {
      return
    }

    const roomId = await getConnectedRoomId(socket.id)

    if (!roomId) {
      return
    }

    const room = await getRoomById(roomId)
    const { members } = room
    const { user } = req

    // user not in room
    if (!Object.prototype.hasOwnProperty.call(members, user.username)) {
      return
    }

    room.members[user.username].position = position
    await hsetAsync(getRoomKey(room.id), 'json', JSON.stringify(room))

    io.in(room.id).emit('pos_change', user.username, position)
  })

  socket.on('leave_room', async () => {
    const roomId = await getConnectedRoomId(socket.id)

    // never joined room
    if (!roomId) {
      console.log('FAIL leave_room', 'Invalid roomId')
      return
    }

    socket.leave(roomId)
    // remove in redis
    await delAsync(getSocketKey(socket.id))
    await removeUserFromRoom(req.user, roomId, onRoomChange(roomId))
    console.log(`leave_room: ${roomId}`, req?.user?.username ?? 'Unauthed user')
  })

  socket.on('disconnecting', async () => {
    const roomId = await getConnectedRoomId(socket.id)

    if (!roomId) {
      console.log('FAIL disconnecting', 'Invalid roomId')
      return
    }

    // remove in redis
    await delAsync(getSocketKey(socket.id))
    await removeUserFromRoom(req.user, roomId, onRoomChange(roomId))
    console.log(`disconnecting: ${roomId}`, req?.user?.username ?? 'Unauthed user')
  })
}

export default {
  onNewSocketConnection,
  getConnectedRoomId
}
