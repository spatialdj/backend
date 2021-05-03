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
    profilePicture: `http://tinygraphs.com/labs/isogrids/hexa16/${username}?theme=bythepool&numcolors=4&fmt=svg`,
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

export { router as authRouter, getUserKey }
