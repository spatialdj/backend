import express from 'express'
import redis, { roomsIndex } from '../redis_client.js'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'

const router = express.Router()

const roomPrefix = 'room:'
// const ftAggregateAsync = promisify(redis.ft_aggregate).bind(redis)
const ftSearchAsync = promisify(redis.ft_search).bind(redis)
const hsetAsync = promisify(redis.hset).bind(redis)
const hgetAsync = promisify(redis.hget).bind(redis)
const existsAsync = promisify(redis.exists).bind(redis)

router.get('/', async (req, res, next) => {
  const searchQuery = req.body.search
  const genres = req.body.filters
  const offset = req.body.skip
  const limit = req.body.limit

  let redisQuery = '@private:{false}'

  if (searchQuery.length > 0) {
    redisQuery += ` @name|description:(${searchQuery})`
  }

  if (genres.length > 0) {
    redisQuery += ` @genres:{${genres.join('|')}}`
  }

  const searchResult = await ftSearchAsync(
    roomsIndex,
    redisQuery,
    'SORTBY', 'numMembers', 'DESC',
    'LIMIT', offset, limit
  )

  res.status(200).json(searchResult.filter(element => Array.isArray(element))
    .map(arr => {
      for (let i = 0; i < arr.length; i += 2) {
        if (arr[i] === 'json') {
          return JSON.parse(arr[i + 1])
        }
      }
    }))
})

function getRoomKey (id) {
  return roomPrefix + id
}

router.post('/create', async (req, res, next) => {
  if (req.isUnauthenticated()) {
    return res.status(401).json()
  }

  const id = uuidv4()
  const name = req.body.name
  const description = req.body.description
  const privateRoom = req.body.private
  const genres = req.body.genres
  const host = {
    username: req.user.username,
    profilePicture: req.user.profilePicture
  }
  const numMembers = '1'
  const members = [host]
  const queue = []
  const currentSong = 'null'

  const room = {
    id,
    name,
    description,
    private: privateRoom,
    genres,
    host,
    numMembers,
    members,
    queue,
    currentSong
  }

  await hsetAsync(
    getRoomKey(id),
    'id', id,
    'name', name,
    'description', description,
    'private', privateRoom,
    'genres', genres.join(),
    'numMembers', numMembers,
    'json', JSON.stringify(room)
  )

  res.status(200).json()
})

router.put('/update/:roomId', async (req, res, next) => {
  if (req.isUnauthenticated()) {
    return res.status(401).json()
  }

  const roomId = req.params.roomId
  const roomExists = await existsAsync(getRoomKey(roomId))

  if (!roomExists) {
    return res.status(400).json()
  }

  const room = JSON.parse(await hgetAsync(getRoomKey(roomId), 'json'))

  if (room.host.username !== req.user.username) {
    return res.status(401).json()
  }

  const name = req.body.name
  const description = req.body.description
  const genres = req.body.genres.join()
  const isPrivate = req.body.private

  room.name = name
  room.description = description
  room.genres = genres
  room.private = isPrivate

  await hsetAsync(getRoomKey(roomId), 'name', name, 'description', description, 'private', isPrivate, 'genres', genres, 'json', JSON.stringify(room))
  res.status(200).json()
})

// socket io join

// socket io leave

export default router
