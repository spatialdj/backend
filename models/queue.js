import redis from '../redis_client.js'
import { promisify } from 'util'

const delAsync = promisify(redis.del).bind(redis)
const lrangeAsync = promisify(redis.lrange).bind(redis)
const lremAsync = promisify(redis.lrem).bind(redis)
const rpushAsync = promisify(redis.rpush).bind(redis)
const lmoveAsync = promisify(redis.lmove).bind(redis)
const lindexAsync = promisify(redis.lindex).bind(redis)

const queuePrefix = 'queue:'

function getQueueKey (roomId) {
  return queuePrefix + roomId
}

async function deleteQueue (roomId) {
  await delAsync(getQueueKey(roomId))
}

async function addToQueue (roomId, user) {
  // check if user is already in queue
  if (await lindexAsync(getQueueKey(roomId), user.username)) {
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
  // move first user in queue to last in queue
  await lmoveAsync(getQueueKey(roomId), 'LEFT', 'RIGHT')

  return {
    host: '',
    user: 'https://www.youtube.com/watch?v=QBQoBU_wo-s'
  }
}

export {
  deleteQueue,
  addToQueue,
  getQueue,
  removeFromQueue,
  getNextSong
}
