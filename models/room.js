import { promisify } from 'util'
import redis from '../redis_client.js'

// prefix for redis key
const roomPrefix = 'room:'

const existsAsync = promisify(redis.exists).bind(redis)
const hgetAsync = promisify(redis.hget).bind(redis)
const hsetAsync = promisify(redis.hset).bind(redis)

// get key in redis given id
function getRoomKey (id) {
  return roomPrefix + id
}

async function isRoomValid (roomId) {
  return await existsAsync(getRoomKey(roomId))
}

async function getRoomById (roomId) {
  return await JSON.parse(await hgetAsync(getRoomKey(roomId), 'json'))
}

async function addUserToRoom (user, roomId) {
  const numMembers = Number(await hgetAsync(getRoomKey(roomId), 'numMembers'))

  hsetAsync(getRoomById(roomId), 'numMembers', numMembers + 1)

  if (!user) {
    return
  }

  // if user is not null we add to members list
  const room = getRoomById(roomId)

  room.members.push(
    {
      username: user.username,
      profilePicture: user.profilePicture
    }
  )

  await hsetAsync(getRoomById(roomId), 'json', JSON.stringify(room))
}

async function removeUserFromRoom (user, roomId) {
  const numMembers = Number(await hgetAsync(getRoomKey(roomId), 'numMembers'))

  hsetAsync(getRoomById(roomId), 'numMembers', numMembers - 1)

  if (!user) {
    return
  }

  // if user is not null we add to members list
  const room = getRoomById(roomId)
  const members = room.members

  for (let i = 0; i < members.length; ++i) {
    if (members[i].username === user.username) {
      members.splice(i, 1)
      break
    }
  }

  await hsetAsync(getRoomById(roomId), 'json', JSON.stringify(room))
}

export {
  getRoomKey,
  isRoomValid,
  getRoomById,
  addUserToRoom,
  removeUserFromRoom
}
