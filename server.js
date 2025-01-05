import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const db = await open({
  filename: 'chat.db',
  driver: sqlite3.Database
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT,
      user_id TEXT
  );
`);

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', async (socket) => {
  console.log('a user connected');
  
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('chat message', async (msg, userId, clientOffset, callback) => {
    console.log('received message:', msg, userId, clientOffset);
    
    let result;
    try {
        result = await db.run('INSERT INTO messages (content, user_id, client_offset) VALUES (?, ?, ?)', msg, userId, clientOffset);
    } catch (e) {
        if (e.errno === 19 /* SQLITE_CONSTRAINT */ ) {
            callback();
            return;
        }
        console.error(e);
        return;
    }
    
    io.emit('chat message', msg, userId, result.lastID);
    callback(result.lastID);
    console.log('message broadcasted');
  });

  if (!socket.recovered) {
    console.log('recovering messages');
    try {
      const offset = socket.handshake.auth.serverOffset || 0;
      await db.each('SELECT id, content, user_id FROM messages WHERE id > ?',
        [offset], (_err, row) => {
          socket.emit('chat message', row.content, row.user_id, row.id);
          console.log(row.content, row.user_id, row.id);
        });
    } catch (e) {
      console.error('Error during message recovery:', e);
    }
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
