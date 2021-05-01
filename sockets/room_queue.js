import io from '../socketio_server.js'
import { addToQueue, removeFromQueue, getNextSong, timers as queueTimers } from '../models/queue.js'
import { setSong } from '../models/room.js'
import socketsRoom from './room.js'

const { getConnectedRoomId } = socketsRoom

const QUEUE_BUFFER_MS = 5000

async function startPlayingQueue (roomId) {
  const song = getNextSong(roomId)

  if (song === null) {
    // no one is in queue, stop
    return
  }

  const startTime = Date.now()

  // set song in room
  await setSong(song, startTime)
  io.to(roomId).emit('play_song', song.username, song.id, startTime)

  const timer = setTimeout(async () => await startPlayingQueue(), song.duration + QUEUE_BUFFER_MS)

  queueTimers.set(roomId, timer)
  // todo: implement skip with clearTimeout(timer)
}

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

    if (position === 0) {
      // play the user's song since it's the first in queue
      await startPlayingQueue(roomId)
    }
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
