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

### How the data is stored:
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
    - `EXISTS ${roomId}`: Check if a room exists (used when attempting to join room)
    - `FT.SEARCH @name|description:(${searchQuery}) @private:{false} @genres:{${genres}} SORTBY numMembers DESC LIMIT ${offset} ${limit}`: Used for rooms page for searching
- User queue
  - Prefix: `queue:`
  - Type: `LIST`
  - Data: A list of usernames of users in the queue of the associated room
  - Commands:
    - `RPUSH queue:${roomId} ${username}`: Add user to queue or create queue
    - `LRANGE queue:${roomId} 0 -1`: Get all users in the queue
    - `LREM queue:${roomId} -1, ${username}`: Remove user from queue
    - `LMOVE queue:${roomId} queue:${roomId} LEFT RIGHT`: Cycle through queue (move user from front of queue to back of queue)
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
  - Example user:
    - ```
        {
          "username": ...,
          "password": ...,
          "profilePicture": ...,
          "playlist": { ... },
          "selectedPlaylist": ...
        }
      ```
  - Commands:
    - `JSON.SET user:${username} ${path} ${userJson}`: Create a new user or update user data
    - `JSON.GET user:${username} ${path}`: Get user data
- Messages
  - Prefix: `message:`
  - Type: `LIST`
  - Data: JSON-stringified objects, with fields `id`, `timeSent`, `text`, `sender` (which contains fields `username` and `profilePicture`)
  - Commands:
    - `LPUSH message:${messagesId} ${data}`: Add a new message to the room's message history
    - `LRANGE message:${messagesId} ${start} ${end}`: Get message history of a room, starting with the newest and going backwards
- Socket
  - Prefix: `socket:`
  - Type: `STRING`
  - Data: The username that this socket belongs to
  - Commands:
    - `SET socket:${socketId} ${username}`: Create a new socket
    - `GET socket:${socketId}`: Get associated username associated with socket
    - `DEL socket:${socketId}`: Delete socket

### Data flow
- For users:
  - When a user registers, a user is created like: 
    - `JSON.SET user:${username} . ${userJson}`
  - To log a user in, a new session is created: 
    - `SET sess:${sessionId} ${data}`
  - To retrieve user information: 
    - `JSON.GET user:${username} ${path}`
- For sockets:
  - When a new socket is connected to the server and the request is authenticated (user is logged in), a new socket is created and the associated username is stored: 
    - `SET socket:${socketId} ${username}`
  - When a socket is disconnected from the server, it is deleted:
    - `DEL socket:${socketId}`
- For rooms:
  - When a room is searched for, RedisSearch is used to make the search: 
    - `FT.SEARCH @name|description:(${searchQuery}) @private:{false} @genres:{${genres}} SORTBY numMembers DESC LIMIT ${offset} ${limit}`
  - When a new room is created, a room is created like: 
    - `HSET room:${roomId} id ${roomId} name ${name} description ${description} private ${private} genres ${genres} numMembers ${numMembers} json ${roomJson}`
  - When a room is updated, it is updated like (all fields are optional): 
    - `HSET room:${roomId} id ${roomId} name ${name} description ${description} private ${private} genres ${genres} numMembers ${numMembers} json ${roomJson}`
- For queues:
  -  When a user joins the queue, a queue is created/the user is added to the queue: 
     -  `RPUSH queue:${roomId} ${username}`
  -  When it is a user's turn to play a song, the user is moved to the end of the queue: 
     -  `LMOVE queue:${roomId} queue:${roomId} LEFT RIGHT`
- For playlists:
  - When a new playlist is created:
    - `JSON.SET user:${username} .playlist.${playlistId} ${playlistJson}`
  - When a playlist is deleted:
    - `JSON.DEL user:${username} .playlist.${playlistId}`
  - When the user selects a playlist:
    - `JSON.SET user:${username} .selectedPlaylist ${playlistId})`
  - When a song is added to a playlist: 
    - `JSON.ARRAPPEND user:${username} .playlist.${playlistId}.queue ${song}`
  - To get songs from a playlist:
    - `JSON.GET user:${username} .playlist.${playlistId}.queue`

## How to run it locally?
### Prerequisites:
- Node v14.16.1
- npm v6.14.12
- Redis v6.2.3 with RediSearch v2.0 and RedisJSON v1.0

### Running in production
1. Go to root folder of frontend
2. Install dependencies: `npm ci`
3. Build frontend: `npm run build`
4. Copy files from `/build` to the backend `/public` folder
5. Go to root directory of backend
6. Install dependencies: `npm ci`
7. Create a file called `config.yml` with the following contents:
```
export default {
  redisHost: 'localhost',
  redisPassword: '',
  sessionSecret: 'somesessionsecret',
  passwordSaltRounds: 10,
  youtube_key: 'youtube_api_key'
}
```
8. Replace the values with your own information
9. Run server: `PORT=80 NODE_ENV=production node bin/www.js`
