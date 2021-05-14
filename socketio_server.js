import { Server } from 'socket.io'
import RedisAdapter from 'socket.io-redis'
import redis from './redis_client.js'

const server = new Server()

const pubClient = redis.duplicate()
const subClient = redis.duplicate()

server.adapter(RedisAdapter({ pubClient, subClient }))

export default server
