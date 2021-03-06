import { addMessage } from '../models/room.js'
import io from '../socketio_server.js'
import socketsRoom from './room.js'
import { v4 as uuidv4 } from 'uuid'

const { getConnectedRoomId } = socketsRoom

function onNewSocketConnection (socket) {
  const req = socket.request

  socket.on('chat_message', async (message, timeSent, ackcb) => {
    if (req.isAuthenticated()) {
      const roomId = await getConnectedRoomId(socket.id)
      const messageObject = {
        id: uuidv4(),
        timeSent: timeSent,
        text: message,
        sender: {
          username: req.user.username,
          profilePicture: req.user.profilePicture
        }
      }

      if (!roomId) {
        console.log('FAIL chat_message', 'No room id')
        return
      }

      await addMessage(messageObject, roomId)
      io.in(roomId).emit('chat_message', {
        message: message,
        timeSent: timeSent,
        sender: {
          username: req.user.username,
          profilePicture: req.user.profilePicture
        }
      })

      console.log(`chat_message: ${roomId}`, `${req.user.username}: ${message}`)
      return ackcb({ success: true })
    } else {
      return ackcb({ success: false })
    }
  })

  socket.on('reaction', async (reaction) => {
    if (req.isAuthenticated()) {
      const roomId = await getConnectedRoomId(socket.id)

      if (!roomId) {
        console.log('FAIL reaction', 'No room id')
        return
      }

      io.in(roomId).emit('reaction', {
        message: reaction,
        sender: {
          username: req.user.username
        }
      })

      const timeSent = Date.now()
      const message = 'reacted with ' + reaction
      io.in(roomId).emit('chat_message', {
        message: message,
        timeSent: timeSent,
        sender: {
          username: req.user.username,
          profilePicture: req.user.profilePicture
        }
      })

      console.log(`reaction: ${roomId}`, `${req.user.username}: ${reaction}`)
    }
  })
}

export default { onNewSocketConnection }
