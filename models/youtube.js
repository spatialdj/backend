import parseIsoDuration from 'parse-iso-duration'

import config from '../config.js'
import youtubeV3API from 'youtube-v3-api'

const API_KEY = config.youtube_key
const { YoutubeDataAPI } = youtubeV3API
const api = new YoutubeDataAPI(API_KEY)

async function getVideoDuration (videoId) {
  const response = await api.searchVideo(videoId)

  if (response.items.length === 0) {
    return null
  }

  const data = response.items[0]
  const duration = parseIsoDuration(data.contentDetails.duration)

  return duration
}

async function searchVideos (query) {
  const response = await api.searchAll(query, 20, { type: 'video' })

  const videos = Array.from(response.items).map((item) => {
    const snippet = item.snippet
    return {
      videoId: item.id.videoId,
      title: snippet.title,
      thumbnails: snippet.thumbnails,
      channelTitle: snippet.channelTitle
    }
  })

  return videos
}

export {
  getVideoDuration,
  searchVideos
}
