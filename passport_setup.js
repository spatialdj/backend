import passport from 'passport'
import { promisify } from 'util'
import passportLocal from 'passport-local'
import bcrypt from 'bcrypt'
import redis from './redis_client.js'

const LocalStrategy = passportLocal.Strategy

const usersPrefix = 'user:'
const jsonGetAsync = promisify(redis.json_get).bind(redis)
const existsAsync = promisify(redis.exists).bind(redis)

function getUserKey (username) {
  return usersPrefix + username
}

passport.use(new LocalStrategy(
  {
    usernameField: 'username',
    passwordField: 'password'
  },
  async (username, password, done) => {
    if (username.length < 3 || username.length > 16) {
      return done(null, false)
    }

    if (password.length < 6 || password.length > 64) {
      return done(null, false)
    }

    if (!/^\w+$/.test(username)) {
      return done(null, false)
    }

    try {
      const userExists = await existsAsync(getUserKey(username))

      if (!userExists) {
        return done(null, false)
      }

      const user = JSON.parse(await jsonGetAsync(getUserKey(username), '.'))
      const match = await bcrypt.compare(password, user.password)

      // incorrect password
      if (!match) {
        return done(null, false)
      }

      done(null, user)
    } catch (err) {
      done(err)
    }
  }
))

// sessions
passport.serializeUser((user, done) => {
  done(null, user.username)
})

passport.deserializeUser(async (username, done) => {
  try {
    const user = await jsonGetAsync(getUserKey(username))

    done(null, JSON.parse(user))
  } catch (err) {
    done(err)
  }
})
