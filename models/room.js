import { promisify } from 'util'
import redis from '../redis_client.js'

// prefix for redis key
const roomPrefix = 'room:'

const existsAsync = promisify(redis.exists).bind(redis)
const hgetAsync = promisify(redis.hget).bind(redis)
const hsetAsync = promisify(redis.hset).bind(redis)
const delAsync = promisify(redis.del).bind(redis)

function getRandomNum (min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

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

async function setSong (roomId, song, startTime) {
  const room = await getRoomById(roomId)

  if (song == null) {
    delete room.currentSong
    delete room.songStartTime
    delete room.votes
  } else {
    room.currentSong = song
    room.songStartTime = startTime
    room.votes = {}
  }

  await hsetAsync(getRoomKey(roomId), 'json', JSON.stringify(room))
}

async function addUserToRoom (user, roomId, onJoin) {
  const room = await getRoomById(roomId)

  const numMembers = Number(await hgetAsync(getRoomKey(roomId), 'numMembers'))
  const members = room.members

  if (Object.prototype.hasOwnProperty.call(members, user.username)) {
    members[user.username].joined++
    await hsetAsync(getRoomKey(roomId), 'json', JSON.stringify(room))
    return room
  }

  await hsetAsync(getRoomKey(roomId), 'numMembers', numMembers + 1)
  room.numMembers++

  const position = {
    x: getRandomNum(0, 300),
    y: getRandomNum(0, 300)
  }

  room.members[user.username] = {
    joined: 1,
    username: user.username,
    profilePicture: user.profilePicture,
    position
  }

  onJoin(user, roomId, position)

  await hsetAsync(getRoomKey(roomId), 'json', JSON.stringify(room))
  return room
}

async function removeUserFromRoom (user, roomId, onRoomChange) {
  if (!user) {
    return
  }

  // if user is not null we remove user from members list
  const room = await getRoomById(roomId)
  const members = room.members

  if (!Object.prototype.hasOwnProperty.call(members, user.username)) {
    return
  }

  const member = room.members[user.username]
  const numMembers = Number(await hgetAsync(getRoomKey(roomId), 'numMembers'))
  let memberLeft = false

  // if only one browser/tab is open for this account
  if (member.joined === 1) {
    await hsetAsync(getRoomKey(roomId), 'numMembers', numMembers - 1)
    delete members[user.username]
    memberLeft = true
  } else {
    member.joined--
  }

  // check if there are no more members
  if (Object.keys(members).length === 0) {
    await onRoomChange(false)
    return await delAsync(getRoomKey(roomId))
  }

  // user leaving is the host, pass it to someone else
  if (memberLeft && room.host.username === user.username) {
    const newHostUser = members[Object.keys(members)[0]]
    const newHost = {
      username: newHostUser.username,
      profilePicture: newHostUser.profilePicture
    }

    // host change
    await onRoomChange(room, true, newHost, user)
    room.host = newHost
  } else if (memberLeft) {
    await onRoomChange(room, true, null, user)
  }

  await hsetAsync(getRoomKey(roomId), 'json', JSON.stringify(room))
}

export {
  getRoomKey,
  isRoomValid,
  getRoomById,
  addUserToRoom,
  removeUserFromRoom,
  setSong
}
