import io from '../socketio_server.js'
import { addToQueue, removeFromQueue } from '../models/queue.js'
import socketsRoom from './room.js'

const { getConnectedRoomId } = socketsRoom

function onNewSocketConnection (socket) {
  const req = socket.request

  socket.on('join_queue', async () => {
    if (req.isUnauthenticated()) {
      return
    }

    const { user } = req
    const roomId = await getConnectedRoomId(user.username)

    // user not connected to room
    if (!roomId) {
      return
    }

    const userFragment = { username: user.username, profilePicture: user.profilePicture }
    const position = await addToQueue(roomId, user)

    io.to(roomId).emit('user_join_queue', position, userFragment)
  })

  socket.on('leave_queue', async () => {
    if (req.isUnauthenticated()) {
      return
    }

    const roomId = await getConnectedRoomId(req.user.username)

    // user not connected to room
    if (!roomId) {
      return
    }

    io.to(roomId).emit('user_leave_queue', req.user.username)
    await removeFromQueue(roomId, req.user)
  })
}

export default { onNewSocketConnection }
