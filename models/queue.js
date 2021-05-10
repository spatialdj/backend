import redis from '../redis_client.js'
import { promisify } from 'util'
import { getUserKey } from '../routes/auth.js'
import io from '../socketio_server.js'

const delAsync = promisify(redis.del).bind(redis)
const lrangeAsync = promisify(redis.lrange).bind(redis)
const lremAsync = promisify(redis.lrem).bind(redis)
const rpushAsync = promisify(redis.rpush).bind(redis)
const lpopAsync = promisify(redis.lpop).bind(redis)
const lmoveAsync = promisify(redis.lmove).bind(redis)
const lposAsync = promisify(redis.lpos).bind(redis)
const llenAsync = promisify(redis.llen).bind(redis)

const jsonGetAsync = promisify(redis.json_get).bind(redis)
const jsonArrPopAsync = promisify(redis.json_arrpop).bind(redis)
const jsonArrAppendAsync = promisify(redis.json_arrappend).bind(redis)

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
  if (await lposAsync(getQueueKey(roomId), user.username) != null) {
    return null
  }

  return await rpushAsync(getQueueKey(roomId), user.username) - 1
}

async function getQueue (roomId) {
  // get all items from first item (0) in queue to last (-1)
  return await lrangeAsync(getQueueKey(roomId), 0, -1)
}

async function removeFromQueue (roomId, user) {
  await lremAsync(getQueueKey(roomId), -1, user.username)
}

async function skipSong (roomId) {
  if (!timers.has(roomId)) {
    return
  }

  const { queueTimer, syncTimer } = timers.get(roomId)

  // cancel current timers
  clearTimeout(queueTimer)
  clearTimeout(syncTimer)
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

    if (!username) {
      return null
    }

    const userKey = getUserKey(username)
    let selectedPlaylist = null

    try {
      selectedPlaylist = JSON.parse(await jsonGetAsync(userKey, '.selectedPlaylist'))
    } catch (err) {
      // path does not exist
    }

    if (!selectedPlaylist) {
      await lpopAsync(queueKey)
      io.to(roomId).emit('dequeued')
      continue
    }

    let nextSong = null

    try {
      nextSong = await jsonArrPopAsync(userKey, `.playlist.${selectedPlaylist}.queue`, 0)
    } catch (error) {
      // no songs in playlist
    }

    if (!nextSong) {
      await lpopAsync(queueKey)
      io.to(roomId).emit('dequeued')
      continue
    }

    await jsonArrAppendAsync(userKey, `.playlist.${selectedPlaylist}.queue`, nextSong)
    song = JSON.parse(nextSong)
    // attach username to song to send to client later
    song.username = username
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
  skipSong,
  timers
}
