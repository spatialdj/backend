import express from 'express'
import passport from 'passport'
import redis from '../redis_client.js'
import { promisify } from 'util'
import bcrypt from 'bcrypt'

import config from '../config.js'

const router = express.Router()

const usersPrefix = 'user:'

// redis methods to promises
const jsonSetAsync = promisify(redis.json_set).bind(redis)
const existsAsync = promisify(redis.exists).bind(redis)

function getUserKey (username) {
  return usersPrefix + username
}

router.get('/', (req, res, next) => {
  if (req.isAuthenticated()) {
    const user = req.user
    delete user.password
    return res.status(200).json(user)
  }

  res.status(401).send()
})

router.post('/login', passport.authenticate('local'), (req, res, next) => {
  res.status(200).send()
})

router.post('/logout', (req, res, next) => {
  req.logout()
  res.status(200).json()
})

router.post('/register', async (req, res, next) => {
  const username = req.body.username
  const password = req.body.password

  if (username.length < 3 || username.length > 16) {
    return res.status(400).send()
  }

  if (password.length < 6 || password.length > 64) {
    return res.status(400).send()
  }

  if (!/^\w+$/.test(username)) {
    return res.status(400).send()
  }

  const userExists = await existsAsync(getUserKey(username))

  if (userExists) {
    return res.status(401).send()
  }

  const passwordHash = await bcrypt.hash(password, config.passwordSaltRounds)
  const user = {
    username: username,
    password: passwordHash,
    profilePicture: `https://avatars.dicebear.com/api/human/${username}.svg?width=64&height=64`,
    playlist: {}
  }

  await jsonSetAsync(getUserKey(username), '.', JSON.stringify(user))
  // login user after register
  req.login(user, err => {
    if (err) {
      return next(err)
    }
  })

  res.status(200).send()
})

router.put('/update', async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send()
  }

  const profilePicture = req.body.profilePicture

  if (profilePicture.match(/^http[^?]*.(jpg|jpeg|gif|png|tiff|bmp|webp|svg)(\?(.*))?$/gmi) == null) {
    return res.status(400).send()
  }

  const updatedUser = {
    username: req.user.username,
    password: req.user.password,
    profilePicture: profilePicture,
    playlist: req.user.playlist,
    selectedPlaylist: req.user.selectedPlaylist
  }

  await jsonSetAsync(getUserKey(req.user.username), '.', JSON.stringify(updatedUser))

  res.status(200).send()
})

export { router as authRouter, getUserKey }
