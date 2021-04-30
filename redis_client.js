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

const roomsIndex = 'roomsIndex'

client.on('error', err => {
  console.error(err)
})

client.on('ready', async () => {
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
