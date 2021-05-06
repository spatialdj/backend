import io from '../socketio_server.js'
import { setSong, getRoomById, getRoomKey } from '../models/room.js'
import redis from '../redis_client.js'
import socketsRoom from './room.js'
import { promisify } from 'util'

const { getConnectedRoomId } = socketsRoom
const hsetAsync = promisify(redis.hset).bind(redis)

const voteType = {
  DISLIKE: 'dislike',
  LIKE: 'like',
  NONE: 'none'
}

function onNewSocketConnection (socket) {
  const req = socket.request

  socket.on('vote', async (type) => {
    if (req.isUnauthenticated()) {
      return
    }

    const { user } = req
    const roomId = await getConnectedRoomId(socket.id)

    // user not connected to room
    if (!roomId) {
      return
    }

    // invalid vote type
    if (type !== voteType.DISLIKE && type !== voteType.LIKE && type !== voteType.NONE) {
      return
    }

    const room = await getRoomById(roomId)

    if (!room) {
      return
    }

    if (!room.votes) {
      return
    }

    if (room.votes[user.username] === type) {
      // vote type is same as before, do nothing
      return
    }

    if (room.votes[user.username] === voteType.NONE) {
      delete room.votes[user.username]
    } else {
      room.votes[user.username] = type
    }

    io.to(roomId).emit('user_vote', room.votes)
    await hsetAsync(getRoomKey(roomId), 'json', JSON.stringify(room))
  })
}

export default {
  onNewSocketConnection
}
