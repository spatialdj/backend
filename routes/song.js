import express from 'express'
import config from '../config.js'
import youtubeV3API from 'youtube-v3-api'
import parseIsoDuration from 'parse-iso-duration'
import urlParser from 'js-video-url-parser'

const router = express.Router()
const API_KEY = config.youtube_key
const { YoutubeDataAPI } = youtubeV3API
const api = new YoutubeDataAPI(API_KEY)

router.get('/info', async (req, res, next) => {
  const url = req.body.url
  const parseUrl = urlParser.parse(url)
  const response = await api.searchVideo(parseUrl.id)
  const data = response.items[0]

  const title = data.snippet.title
  const thumbnails = data.snippet.thumbnails
  const duration = parseIsoDuration(data.contentDetails.duration)

  res.status(200).json({ success: true, data: { title, thumbnails, duration } })
})

router.get('/search', async (req, res) => {
  const query = req.query.search;
  const response = await api.searchAll(query, 20, {type: 'video'})

  const videos = Array.from(response.items).map((item) => {
    const snippet = item.snippet
    return {
      id: item.id.videoId,
      title: snippet.title,
      thumbnails: snippet.thumbnails,
      channelTitle: snippet.channelTitle
    }
  })
  //console.log(response.items)
  res.status(200).json({ success: true, data: { videos } })
})

export default router
