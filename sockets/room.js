import io from '../socketio_server.js'
import { v4 as uuidv4 } from 'uuid'
import redis from '../redis_client.js'
import { addToQueue, removeFromQueue, getQueue, getNextSong, deleteQueue } from '../models/queue.js'
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
}

function onRoomChange (roomId) {
  return async (isRoomOpen, newHost, userLeft) => {
    if (!isRoomOpen) {
      return await onRoomClose(roomId)
    }

    if (userLeft) {
      onLeave(userLeft, roomId)
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

function onNewSocketConnection (socket) {
  const req = socket.request

  socket.on('create_room', async (data, ackcb) => {
    if (req.isUnauthenticated()) {
      console.log('FAIL create_room', 'Unauthed user')
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
    console.log(`create_room: ${room.id}`, req.user.username)
    ackcb({ success: true, room })
  })

  socket.on('join_room', async (roomId, ackcb) => {
    if (!(await isRoomValid(roomId))) {
      console.log(`FAIL join_room: ${roomId}`, 'Invalid roomId')
      return ackcb({ success: false })
    }

    const connectedRoomId = await getConnectedRoomId(socket.id)

    // probably the host joining the room after creation, do not do anything
    if (connectedRoomId) {
      console.log(`join_room: ${roomId}`, req.user.username)
      return ackcb({ success: true, guest: false, room: await getRoomById(connectedRoomId) })
    }

    // set in redis
    await setAsync(getSocketKey(socket.id), roomId)

    socket.join(roomId)

    if (req.isUnauthenticated()) {
      console.log(`join_room: ${roomId}`, 'Unauthed user')
      return ackcb({ success: true, guest: true, room: await getRoomById(roomId) })
    }

    const updatedRoom = await addUserToRoom(req.user, roomId, onJoin)
    console.log(`join_room: ${roomId}`, req.user.username)
    ackcb({ success: true, guest: false, room: updatedRoom })
  })

  socket.on('pos_change', async (position) => {
    if (req.isUnauthenticated()) {
      console.log(`FAIL pos_change`, 'Unauthed user')
      return
    }

    const roomId = await getConnectedRoomId(socket.id)

    if (!roomId) {
      console.log(`FAIL pos_change`, 'Invalid roomId')
      return
    }

    const room = await getRoomById(roomId)
    const { members } = room
    const { user } = req

    // user not in room
    if (!Object.prototype.hasOwnProperty.call(members, user.username)) {
      console.log(`FAIL pos_change: ${roomId}`, `User ${user.username} not in room`)
      return
    }

    room.members[user.username].position = position
    await hsetAsync(getRoomKey(room.id), 'json', JSON.stringify(room))

    io.in(room.id).emit('pos_change', user.username, position)
    console.log(`pos_change: ${roomId}`, `${user.username} {${position.x}, ${position.y}}`)
  })

  socket.on('leave_room', async () => {
    const roomId = await getConnectedRoomId(socket.id)

    // never joined room
    if (!roomId) {
      console.log(`FAIL leave_room`, 'Invalid roomId')
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
      console.log(`FAIL disconnecting`, 'Invalid roomId')
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
