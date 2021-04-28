import { promisify } from 'util'
import redis from '../redis_client.js'

// prefix for redis key
const roomPrefix = 'room:'

const existsAsync = promisify(redis.exists).bind(redis)
const hgetAsync = promisify(redis.hget).bind(redis)
const hsetAsync = promisify(redis.hset).bind(redis)
const delAsync = promisify(redis.del).bind(redis)

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
  if (!user) {
    return
  }

  const room = await getRoomById(roomId)
  const numMembers = Number(await hgetAsync(getRoomKey(roomId), 'numMembers'))
  const memberIndex = room.members.findIndex(member => member.username === user.username)

  if (memberIndex !== -1) {
    room.members[memberIndex].joined++
    return await hsetAsync(getRoomKey(roomId), 'json', JSON.stringify(room))
  }

  await hsetAsync(getRoomKey(roomId), 'numMembers', numMembers + 1)
  room.numMembers++

  room.members.push(
    {
      joined: 1,
      username: user.username,
      profilePicture: user.profilePicture
    }
  )

  await hsetAsync(getRoomKey(roomId), 'json', JSON.stringify(room))
}

async function removeUserFromRoom (user, roomId, onRoomChange) {
  if (!user) {
    return
  }

  // if user is not null we remove user from members list
  const room = await getRoomById(roomId)
  const members = room.members
  const memberIndex = room.members.findIndex(member => member.username === user.username)

  if (memberIndex === -1) {
    return
  }

  const member = members[memberIndex]
  const numMembers = Number(await hgetAsync(getRoomKey(roomId), 'numMembers'))
  let memberLeft = false

  // if only one browser/tab is open for this account
  if (member.joined === 1) {
    await hsetAsync(getRoomKey(roomId), 'numMembers', numMembers - 1)
    members.splice(memberIndex, 1)
    memberLeft = true
  } else {
    member.joined--
  }

  if (members.length === 0) {
    onRoomChange(false)
    return await delAsync(getRoomKey(roomId))
  }

  // user leaving is the host, pass it to someone else
  if (memberLeft && room.host.username === user.username) {
    const newHost = {
      username: members[0].username,
      profilePicture: members[0].profilePicture
    }

    // host change
    onRoomChange(true, newHost)
    room.host = newHost
  }

  await hsetAsync(getRoomKey(roomId), 'json', JSON.stringify(room))
}

export {
  getRoomKey,
  isRoomValid,
  getRoomById,
  addUserToRoom,
  removeUserFromRoom
}
