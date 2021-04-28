import io from '../socketio_server.js'
import { v4 as uuidv4 } from 'uuid'
import redis from '../redis_client.js'
import { getRoomKey, isRoomValid, addUserToRoom, removeUserFromRoom } from '../models/room.js'
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
    const members = [host]
    const queue = []
    const currentSong = 'null'

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

    socket.join(roomId)
    // set in redis
    await setAsync(getSocketKey(socket.id), roomId)
    addUserToRoom(req.user, roomId)
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
    removeUserFromRoom(req.user, roomId)
  })

  socket.on('disconnecting', async (socket, data, callback) => {
    const roomId = await getConnectedRoom(socket.id)

    if (!roomId) {
      return
    }

    // remove in redis
    await delAsync(getSocketKey(socket.id))
    removeUserFromRoom(req.user, roomId)
  })
})
