import redis from 'redis'
import rejson from 'redis-rejson'
import redisearch from 'redis-redisearch'
import { promisify } from 'util'
import config from './config.js'

rejson(redis)
redisearch(redis)
// add ft.aggregate command from redisearch
redis.addCommand('ft.aggregate')

// new command since 6.2.0 for lists
redis.addCommand('lmove')

const client = redis.createClient({
  host: config.redisHost,
  password: config.redisPassword
})

const ftcreateAsync = promisify(client.ft_create).bind(client)
const keysAsync = promisify(client.keys).bind(client)
const del = promisify(client.del).bind(client)

const roomsIndex = 'roomsIndex'

client.on('error', err => {
  console.error(err)
})

client.on('ready', async () => {
  // delete stale data

  /*
  const roomKeys = await keysAsync('room:*')
  const queueKeys = await keysAsync('queue:*')
  const socketKeys = await keysAsync('socket:*')

  if (roomKeys?.length) {
    await del(roomKeys)
  }

  if (queueKeys?.length) {
    await del(queueKeys)
  }

  if (socketKeys?.length) {
    await del(socketKeys)
  }
  */

  // indices on:
  // - name
  // - decscription
  // - genres
  // - numMembers
  // - private
  // create index for room searching
  try {
    await ftcreateAsync(roomsIndex,
      'PREFIX', '1', 'room:',
      'SCHEMA',
      'name', 'TEXT', 'SORTABLE',
      'description', 'TEXT', 'SORTABLE',
      'genres', 'TAG', 'SORTABLE',
      'numMembers', 'NUMERIC', 'SORTABLE',
      'private', 'TAG', 'SORTABLE'
    )
  } catch (err) { }

  console.log(`Connected to Redis at ${config.redisHost}!`)
})

export default client
export {
  roomsIndex
}
