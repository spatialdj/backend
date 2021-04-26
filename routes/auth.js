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

/* GET users listing. */
router.get('/', (req, res, next) => {
  if (req.isAuthenticated()) {
    const user = JSON.parse(req.user)
    delete user.password
    return res.status(200).json(user)
  }

  res.status(401).send()
})

router.post('/login', passport.authenticate('local'), (req, res, next) => {
  res.status(200).send()
})

router.post('/register', async (req, res, next) => {
  const username = req.body.username
  const password = req.body.password
  const userExists = await existsAsync(getUserKey(username))

  if (userExists) {
    return res.status(401).send()
  }

  const passwordHash = await bcrypt.hash(password, config.passwordSaltRounds)

  // todo: auto sign in user after register
  const user = {
    username: username,
    password: passwordHash,
    profilePicture: 'https://www.tinygraphs.com/labs/isogrids/hexa16/hlel?theme=' + username + '&numcolors=4&fmt=svg',
    playlist: []
  }

  await jsonSetAsync(getUserKey(username), '.', JSON.stringify(user))
  res.status(200).send()
})

export default router
