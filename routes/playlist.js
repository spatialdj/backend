import express from 'express'
import redis from '../redis_client.js'
import { v4 as uuidv4 } from 'uuid'
import { promisify } from 'util'

const router = express.Router()

const jsonSetAsync = promisify(redis.json_set).bind(redis)
const jsonGetAsync = promisify(redis.json_get).bind(redis)
const jsonArrAppendAsync = promisify(redis.json_arrappend).bind(redis)

const playlistPrefix = 'playlist:'

function getPlaylistKey (playlistId) {
  return playlistPrefix + playlistId
}

router.post('/create', async (req, res, next) => {
  if (req.isUnauthenticated()) {
    return res.status(401).json()
  }

  const name = req.body.name
  const playlistId = uuidv4()

  try {
    await jsonArrAppendAsync('user:' + req.user.username, '.playlist', JSON.stringify(playlistId))
  } catch (error) {
    // remove the error later in the prod environment
    return res.status(400).json(error)
  }

  const playlist = {
    id: playlistId,
    name: name,
    user: req.user.username,
    queue: []
  }
  try {
    await jsonSetAsync(getPlaylistKey(playlistId), '.', JSON.stringify(playlist))
  } catch (error) {
    return res.status(400).json(error)
  }
  res.status(200).json({
    success: true,
    playlistId: playlistId
  })
})

router.put('/add/:playlistId', async (req, res) => {
  if (req.isUnauthenticated()) {
    return res.status(401).json()
  }

  const playlistId = req.params.playlistId
  const song = req.body.song

  try {
    await jsonArrAppendAsync(getPlaylistKey(playlistId), '.queue', JSON.stringify(song))
  } catch (error) {
    return res.status(400).json(error)
  }

  res.status(200).json({
    sucess: true,
    song: song
  })
})

router.delete('/remove/:playlistId', async (req, res) => {
  if (req.isUnauthenticated()) {
    return res.status(401).json()
  }

  const playlistId = req.params.playlistId
  const songId = req.body.id

  let success = false
  const songs = JSON.parse(await jsonGetAsync(getPlaylistKey(playlistId), '.queue'))
  for (let idx = 0; idx < songs.length; idx++) {
    if (songs[idx].id === songId) {
      songs.splice(idx, 1)
      success = true
      break
    }
  }
  console.log(songs)

  try {
    await jsonSetAsync(getPlaylistKey(playlistId), '.queue', JSON.stringify(songs))
  } catch (error) {
    return res.status(400).json(error)
  }
  res.status(200).json({
    success: success
  })
})

export { router as playlistRouter, getPlaylistKey }
