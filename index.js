import express from "express";
import dotenv from "dotenv";
import connectDb from "./config/db.js";
import authRouter from "./routes/auth.routes.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import userRouter from "./routes/user.routes.js";
import postRouter from "./routes/post.routes.js";
import connectionRouter from "./routes/connection.routes.js";
import http from "http";
import { Server } from "socket.io";

import chatRoutes from "./routes/chat.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import rtcRoutes from "./routes/rtc.routes.js";

import Message from "./models/Message.js";
import jobRoutes from "./routes/job.routes.js";
import testmailRoutes from "./routes/testmail.routes.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
// Trust reverse proxies (Render/Netlify/etc.) so cookies & protocol are determined correctly
app.set('trust proxy', 1);

// CORS origins come from .env (CORS_ORIGINS). No hardcoded production URLs.
const envOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isDev = (process.env.NODE_ENV === "development" || process.env.NODE_ENVIRONMENT === "development");
// In dev, fall back to localhost only; in prod, require CORS_ORIGINS to be set.
const corsOrigins = envOrigins.length ? envOrigins : (isDev ? ["http://localhost:5173"] : []);

if (!envOrigins.length && !isDev) {
  console.warn("[CORS] No CORS_ORIGINS set in env; cross-origin requests will be blocked. Set CORS_ORIGINS in .env.");
}

const corsOptions = {
  origin: corsOrigins,
  credentials: true,
};

// Socket.IO server with same CORS config and resilient transport/timeouts for hosts behind proxies/LB
export const io = new Server(server, {
  cors: { origin: corsOrigins, credentials: true },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
});

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));
// Disable caching for API responses to avoid stale user/session data in some browsers/proxies
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// API routes
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/post", postRouter);
app.use("/api/connection", connectionRouter);

app.use("/api/chat", chatRoutes);
app.use("/api/notification", notificationRouter);
app.use("/api/jobs", jobRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/rtc", rtcRoutes);
app.use("/api/testmail", testmailRoutes);

// Simple health check
app.get(["/", "/health", "/api/health"], (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Map to store connected users: userId -> socketId
export const userSocketMap = new Map();

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id, "transport=", socket.conn?.transport?.name);
  // Observe transport upgrades (polling -> websocket)
  socket.conn?.on?.("upgrade", () => {
    console.log("Socket upgraded:", socket.id, "transport=", socket.conn?.transport?.name);
  });

  socket.on("register", (userId) => {
    userSocketMap.set(userId, socket.id);
    console.log(`User registered: ${userId} -> ${socket.id}`);
  io.emit("user_online", { userId });
  });


  socket.on("send_message", async ({ senderId, receiverId, text, clientId }) => {
    try {
      // Save to DB
      let msg = await Message.create({ from: senderId, to: receiverId, text });
      // If receiver is online, mark delivered
      const receiverSocketId = userSocketMap.get(receiverId);
      if (receiverSocketId) {
        msg.deliveredAt = new Date();
        await msg.save();
        io.to(receiverSocketId).emit("receive_message", {
          senderId,
          text,
          time: new Date().toLocaleTimeString(),
          messageId: msg._id,
        });
      }
      // Notify sender about delivery status
      socket.emit("message_status", { clientId, messageId: msg._id, delivered: Boolean(msg.deliveredAt) });
    } catch (err) {
      console.error("Failed to save message:", err);
    }
  });

  // Typing indicator
  socket.on("typing", ({ from, to, isTyping }) => {
    const receiverSocketId = userSocketMap.get(to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { from, isTyping });
    }
  });

  // Mark messages as read
  socket.on("mark_read", async ({ from, to }) => {
    try {
      await Message.updateMany({ from, to, readAt: null }, { $set: { readAt: new Date() } });
      const senderSocketId = userSocketMap.get(from);
      if (senderSocketId) {
        io.to(senderSocketId).emit("messages_read", { peerId: to });
      }
    } catch (e) {
      console.error("mark_read error", e);
    }
  });

  socket.on("disconnect", () => {
  for (let [userId, sId] of userSocketMap.entries()) {
      if (sId === socket.id) {
        userSocketMap.delete(userId);
        console.log(`User disconnected: ${userId}`);
    io.emit("user_offline", { userId });
        break;
      }
    }
  });

  // WebRTC signaling: voice/video calls
  socket.on("call_user", ({ to, from, offer, callType }) => {
    try {
      const receiverSocketId = userSocketMap.get(to);
      if (!receiverSocketId) {
        socket.emit("call_unavailable", { to });
        return;
      }
      io.to(receiverSocketId).emit("incoming_call", { from, offer, callType });
    } catch (e) {
      console.error("call_user error", e);
    }
  });

  socket.on("answer_call", ({ to, from, answer }) => {
    try {
      const callerSocketId = userSocketMap.get(to);
      if (!callerSocketId) return;
      io.to(callerSocketId).emit("call_answer", { from, answer });
    } catch (e) {
      console.error("answer_call error", e);
    }
  });

  socket.on("ice_candidate", ({ to, from, candidate }) => {
    try {
      const peerSocketId = userSocketMap.get(to);
      if (!peerSocketId) return;
      io.to(peerSocketId).emit("ice_candidate", { from, candidate });
    } catch (e) {
      console.error("ice_candidate error", e);
    }
  });

  // Support renegotiation/ICE restart
  socket.on("renegotiate_offer", ({ to, from, offer }) => {
    try {
      const peerSocketId = userSocketMap.get(to);
      if (!peerSocketId) return;
      io.to(peerSocketId).emit("renegotiate_offer", { from, offer });
    } catch (e) {
      console.error("renegotiate_offer error", e);
    }
  });
  socket.on("renegotiate_answer", ({ to, from, answer }) => {
    try {
      const peerSocketId = userSocketMap.get(to);
      if (!peerSocketId) return;
      io.to(peerSocketId).emit("renegotiate_answer", { from, answer });
    } catch (e) {
      console.error("renegotiate_answer error", e);
    }
  });

  socket.on("end_call", ({ to, from }) => {
    try {
      const peerSocketId = userSocketMap.get(to);
      if (peerSocketId) io.to(peerSocketId).emit("call_ended", { from });
      socket.emit("call_ended", { from });
    } catch (e) {
      console.error("end_call error", e);
    }
  });

  socket.on("reject_call", ({ to, from }) => {
    try {
      const callerSocketId = userSocketMap.get(to);
      if (!callerSocketId) return;
      io.to(callerSocketId).emit("call_rejected", { from });
    } catch (e) {
      console.error("reject_call error", e);
    }
  });
});

// Start server
const port = process.env.PORT || 8000;
server.listen(port, () => {
  connectDb();
  console.log(`Server started on port ${port}`);
});