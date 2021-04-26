import redis from 'redis'
import rejson from 'redis-rejson'
import config from './config.js'

rejson(redis)

const client = redis.createClient({
  host: config.redisHost,
  password: config.redisPassword
})

client.on('error', err => {
  console.error(err)
})

client.on('ready', () => {
  console.log(`Connected to Redis at ${config.redisHost}!`)
})

export default client
