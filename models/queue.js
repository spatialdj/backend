import redis from '../redis_client.js'
import { promisify } from 'util'

const delAsync = promisify(redis.del).bind(redis)
const lrangeAsync = promisify(redis.lrange).bind(redis)
const lremAsync = promisify(redis.lrem).bind(redis)
const rpushAsync = promisify(redis.rpush).bind(redis)
const lmoveAsync = promisify(redis.lmove).bind(redis)
const lindexAsync = promisify(redis.lindex).bind(redis)

const queuePrefix = 'queue:'
const timers = new Map()

function getQueueKey (roomId) {
  return queuePrefix + roomId
}

async function deleteQueue (roomId) {
  await delAsync(getQueueKey(roomId))
  timers.delete(roomId)
}

async function addToQueue (roomId, user) {
  // check if user is already in queue
  try {
    // error is thrown if not in list
    await lindexAsync(getQueueKey(roomId), user.username)
  } catch (err) {
    return null
  }

  return await rpushAsync(getQueueKey(roomId), user.username) - 1
}

async function getQueue (roomId) {
  // get all items from first item (0) in queue to last (-1)
  return await lrangeAsync(getQueueKey(roomId), 0, -1)
}

async function removeFromQueue (roomId, user) {
  await lremAsync(getQueueKey(roomId), user.username)
}

async function getNextSong (roomId) {
  const queueKey = getQueueKey(roomId)
  // move first user in queue to last in queue
  const username = await lmoveAsync(queueKey, queueKey, 'LEFT', 'RIGHT')

  if (!username) {
    return null
  }

  return {
    username: username,
    id: 'QBQoBU_wo-s',
    duration: 148000,
    title: 'Monke monke monke some song title'
  }
}

export {
  deleteQueue,
  addToQueue,
  getQueue,
  removeFromQueue,
  getNextSong,
  timers
}
