import express from 'express'

const router = express.Router()

/* GET users listing. */
router.get('/', function (req, res, next) {
  res.send('auth endpoint')
})

export default router
