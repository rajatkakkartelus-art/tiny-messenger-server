// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// In-memory storage
const messages = []; // {id, from, to, text, ts}
const onlineUsers = new Map(); // username -> socket.id

io.on("connection", (socket) => {
  socket.on("identify", (username) => {
    if (typeof username !== "string" || !username.trim()) return;
    username = username.trim().slice(0, 32);
    onlineUsers.set(username, socket.id);
    socket.data.username = username;

    // send last 50 messages relevant to this user
    const recent = messages
      .filter((m) => m.from === username || m.to === username)
      .slice(-50);
    socket.emit("history", recent);
  });

  socket.on("send_message", (payload) => {
    const from = socket.data.username;
    if (!from) return;
    if (!payload || typeof payload !== "object") return;

    const to = String(payload.to || "").trim().slice(0, 32);
    const text = String(payload.text || "").trim();
    if (!to || !text) return;
    if (text.length > 2000) return;

    const msg = { id: crypto.randomUUID(), from, to, text, ts: Date.now() };
    messages.push(msg);

    // send to sender
    socket.emit("new_message", msg);

    // send to recipient if online
    const toSocketId = onlineUsers.get(to);
    if (toSocketId) io.to(toSocketId).emit("new_message", msg);
  });

  socket.on("disconnect", () => {
    if (socket.data.username) onlineUsers.delete(socket.data.username);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Messenger server running at http://localhost:${PORT}`);
});
