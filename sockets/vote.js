import io from '../socketio_server.js'
import { setSong, getRoomById } from '../models/room.js'
import socketsRoom from './room.js'

const { getConnectedRoomId } = socketsRoom

const voteType = {
  DISLIKE: 'dislike',
  LIKE: 'like'
}

function onNewSocketConnection (socket) {
  const req = socket.request

  socket.on('vote', async (type) => {
    if (!req.isUnauthenticated()) {
      return
    }

    const { user } = req
    const roomId = await getConnectedRoomId(socket.id)

    // user not connected to room
    if (!roomId) {
      return
    }

    // invalid vote type
    if (type !== voteType.DISLIKE && type !== voteType.LIKE) {
      return
    }

    const room = await getRoomById(roomId)

    if (!room) {
      return
    }

    if (!room.votes) {
      return
    }

    if (room.votes[user.username] === voteType) {
      // vote type is same as before, do nothing
      return
    }

    room.votes[user.username] = voteType
    io.to(roomId).emit('user_vote', room.votes)
  })
}
