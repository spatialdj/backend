import redis from '../redis_client.js'
import { promisify } from 'util'
import { getUserKey } from '../routes/auth.js'

const delAsync = promisify(redis.del).bind(redis)
const lrangeAsync = promisify(redis.lrange).bind(redis)
const lremAsync = promisify(redis.lrem).bind(redis)
const rpushAsync = promisify(redis.rpush).bind(redis)
const rpopAsync = promisify(redis.rpop).bind(redis)
const lmoveAsync = promisify(redis.lmove).bind(redis)
const lindexAsync = promisify(redis.lindex).bind(redis)
const llenAsync = promisify(redis.llen).bind(redis)

const jsonGetAsync = promisify(redis.json_get).bind(redis)
const jsonArrPopAsync = promisify(redis.json_arrpop).bind(redis)
const jsonArrAppendAsync = promisify(redis.json_arrappend).bind(redis)

const queuePrefix = 'queue:'
const timers = new Map()

async function getNextPlaylistSong (username, playlistId) {
  const song = await jsonArrPopAsync(getUserKey(username), '.playlist.' + playlistId, 0)
  if (song !== null) {
    return JSON.parse(song)
  }
  return null
}

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
  // Returns the id of the next song to be played.
  // If the next user doesn't have a selectedPlaylist, or if the selectedPlaylist
  // is empty, they'll be removed from the queue.

  const queueKey = getQueueKey(roomId)

  let song = null
  while (await llenAsync(queueKey) > 0) {
    // move first user in queue to last in queue
    const username = await lmoveAsync(queueKey, queueKey, 'LEFT', 'RIGHT')
    if (!username) return null

    const userKey = getUserKey(username)

    const selectedPlaylist = await jsonGetAsync(userKey, '.selectedPlaylist')
    if (!selectedPlaylist) {
      await rpopAsync(queueKey)
      continue
    }

    const nextSong = await jsonArrPopAsync(userKey, '.playlist.' + selectedPlaylist + '.queue')
    if (!nextSong) {
      await rpopAsync(queueKey)
      continue
    }

    await jsonArrAppendAsync(userKey, '.playlist.' + selectedPlaylist + '.queue', nextSong)
    song = JSON.parse(nextSong)
    break
  }

  return song
}

export {
  deleteQueue,
  addToQueue,
  getQueue,
  removeFromQueue,
  getNextSong,
  timers
}
