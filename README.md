<!--
THIS README TEMPLATE WAS ADAPTED FROM https://github.com/othneildrew/Best-README-Template
-->

<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="https://github.com/reeedis">
    <img src="https://avatars.githubusercontent.com/u/83042272" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Spatial.dj Backend</h3>

  <p align="center">
    Backend for Spatial.dj, a web app that allows you to listen to music with your friends.
    <br />
    <br />
    <a href="http://spatial.francochen.com/">View Demo</a>
    ·
    <a href="https://github.com/reeedis/backend/issues">Report Bug</a>
    ·
    <a href="https://github.com/reeedis/backend/issues">Request Feature</a>
    .
    <a href="https://github.com/reeedis/frontend">Frontend Repo</a>
  </p>
</p>

## Tech Stack
- Frontend: JavaScript, React, Chakra UI, Redux, Socket.io, Axios
- Backend: JavaScript, Node.js, Express, Redis (node-redis), Socket.io

## How it works
Redis is used as both a cache and a database

# How the data is stored:
- Room
  - Prefix: `room:`
  - Type: `HASH`
  - Fields:
    - `messages`: redis key to messages to this room
    - `id`: id of this room
    - `json`: JSON representation of this room (used because RediSearch does not support JSON yet)
    - `numMembers`: the number of members currently in the room
    - `description`: the description of the room
    - `name`: the name of the room
    - `private`: (true | false) whether the room is searchable
    - `genres`: genres the room is geared towards
  - Indices (RediSearch):
    - `name`: `TEXT`
    - `description`: `TEXT`
    - `genres`: `TAG`
    - `numMembers`: `NUMERIC`
    - `private`: `TAG`
  - Commands:
    - `HGET ${roomId} json`: get JSON representation of this room
    - `HSET room:${roomId} id ${roomId} name ${name} description ${description} private ${private} genres ${genres} numMembers ${numMembers} json ${roomJson}`: Create a new room or update room (not all fields required)
    - `EXISTS ${roomId}`: check if a room exists (used when attempting to join room)
    - `FT.SEARCH @name|description:(${searchQuery}) @private:{false} @genres:{${genres}} SORTBY numMembers DESC LIMIT ${offset} ${limit}`: Used for rooms page for searching
- Song queue
  - Prefix: `queue:`
  - Type: `LIST`
  - Data: A list of usernames of users in the queue of the associated room
  - 
- Session
  - Prefix: `sess:`
  - Type: `STRING`
  - Data: Stores session data for authentication
  - Commands:
    - `SET sess:${sessionId} ${data}`: Create a new session. Used by `connect-redis`
    - `GET sess:${sessionId}`: Get session data. Used by `connect-redis`
    - `EXISTS sess:${sessionId}`: Check if session exists. Used by `connect-redis`
- User
  - Prefix: `user:`
  - Type: `JSON`
  - Fields:
    - `username`: Username of user
    - `password`: Hashed and salted password using bcrypt
    - `profilePicture`: URL to an image
    - `selectedPlaylist`: user's currently selected playlist
    - `playlist`: playlist objects
      - Example playlist:
        - ```
          "db168000-fa58-491b-81d0-1287d866fcf7": {
            "id": "db168000-fa58-491b-81d0-1287d866fcf7",
            "name": "Text playlist",
            "user": "exampleuser",
            "queue": [
                {
                "videoId": "TT4PHY0_hwE",
                "title": "Ekcle - Pearl Jigsaw",
                "thumbnails": {
                    "default": {
                    "url": "https://i.ytimg.com/vi/TT4PHY0_hwE/default.jpg",
                    "width": 120,
                    "height": 90
                    }
                },
                "channelTitle": "Ekcle",
                "id": "2f7473db-2aec-4ec1-a2bd-623ed6b3ce48",
                "duration": 348000
                }
            ]
          }
          ```
- Messages
  - Prefix: `message:`
  - Type: `LIST`
  - Data: JSON-stringified objects, with fields `id`, `timeSent`, `text`, `sender` (which contains fields `username` and `profilePicture`)
  - Commands:
    - `LPUSH message:${messagesId} ${data}`: Add a new message to the room's message history
    - `LRANGE message:${messagesId} ${start} ${end}`: Get message history of a room, starting with the newest and going backwards