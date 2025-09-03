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
import User from "./models/user.model.js";

import chatRoutes from "./routes/chat.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import rtcRoutes from "./routes/rtc.routes.js";
import uploadRoutes from "./routes/upload.routes.js";

import Message from "./models/Message.js";
import jobRoutes from "./routes/job.routes.js";
import testmailRoutes from "./routes/testmail.routes.js";
import CallLog from "./models/CallLog.js";

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

// Optionally serve any static assets placed in ./public (useful in dev). In prod we primarily use Cloudinary.
try {
  import('path').then(({ default: path }) => {
    const publicDir = path.resolve(process.cwd(), 'public');
    app.use('/public', express.static(publicDir));
  }).catch(() => {});
} catch {}

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
app.use("/api/upload", uploadRoutes);

// Simple health check
app.get(["/", "/health", "/api/health"], (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Map to store connected users: userId -> Set of socketIds (supports multi-tabs)
export const userSocketMap = new Map();

function addUserSocket(userId, socketId) {
  const set = userSocketMap.get(userId) || new Set();
  const wasEmpty = set.size === 0;
  set.add(socketId);
  userSocketMap.set(userId, set);
  return wasEmpty; // indicates transition offline->online
}

function removeUserSocket(socketId) {
  for (let [userId, set] of userSocketMap.entries()) {
    if (set.has(socketId)) {
      set.delete(socketId);
      if (set.size === 0) {
        userSocketMap.delete(userId);
        return { userId, nowOffline: true };
      }
      return { userId, nowOffline: false };
    }
  }
  return null;
}

function getUserSockets(userId) {
  return Array.from(userSocketMap.get(userId) || []);
}

function emitToUser(userId, event, payload) {
  const sockets = getUserSockets(userId);
  sockets.forEach((sid) => io.to(sid).emit(event, payload));
}

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id, "transport=", socket.conn?.transport?.name);
  // Observe transport upgrades (polling -> websocket)
  socket.conn?.on?.("upgrade", () => {
    console.log("Socket upgraded:", socket.id, "transport=", socket.conn?.transport?.name);
  });

  socket.on("register", (userId) => {
    const becameOnline = addUserSocket(userId, socket.id);
    console.log(`User registered: ${userId} -> ${socket.id}`);
    if (becameOnline) io.emit("user_online", { userId });
    // Send initial presence snapshot to this user
    const onlineUserIds = Array.from(userSocketMap.entries())
      .filter(([_, set]) => set.size > 0)
      .map(([uid]) => uid);
    socket.emit("presence_snapshot", { users: onlineUserIds });
  });


  socket.on("send_message", async ({ senderId, receiverId, text, clientId, attachment }) => {
    try {
      // Save to DB
      const payload = { from: senderId, to: receiverId, text };
      if (attachment && attachment.url) {
        payload.attachmentUrl = attachment.url;
        payload.attachmentType = attachment.type || "file";
        payload.attachmentName = attachment.name || "";
        payload.attachmentMime = attachment.mime || "";
        payload.attachmentSize = attachment.size || 0;
        payload.attachmentWidth = attachment.width || 0;
        payload.attachmentHeight = attachment.height || 0;
      }
      let msg = await Message.create(payload);
      // If receiver is online, mark delivered
      const receiverSockets = getUserSockets(receiverId);
      if (receiverSockets.length) {
        msg.deliveredAt = new Date();
        await msg.save();
        const emitData = {
          senderId,
          text,
          time: new Date().toLocaleTimeString(),
          messageId: msg._id,
        };
        if (msg.attachmentUrl) {
          emitData.attachment = {
            url: msg.attachmentUrl,
            type: msg.attachmentType,
            name: msg.attachmentName,
            mime: msg.attachmentMime,
            size: msg.attachmentSize,
            width: msg.attachmentWidth,
            height: msg.attachmentHeight,
          };
        }
        receiverSockets.forEach((sid) => io.to(sid).emit("receive_message", emitData));
      }
      // Notify sender about delivery status
      socket.emit("message_status", { clientId, messageId: msg._id, delivered: Boolean(msg.deliveredAt) });
    } catch (err) {
      console.error("Failed to save message:", err);
    }
  });

  // Typing indicator
  socket.on("typing", ({ from, to, isTyping }) => {
  const sockets = getUserSockets(to);
  sockets.forEach((sid) => io.to(sid).emit("typing", { from, isTyping }));
  });

  // Allow clients to request a presence snapshot at any time
  socket.on("presence_request", () => {
    try {
      const onlineUserIds = Array.from(userSocketMap.entries())
        .filter(([_, set]) => set.size > 0)
        .map(([uid]) => uid);
      socket.emit("presence_snapshot", { users: onlineUserIds });
    } catch {}
  });

  // Mark messages as read
  socket.on("mark_read", async ({ from, to }) => {
    try {
      await Message.updateMany({ from, to, readAt: null }, { $set: { readAt: new Date() } });
  const sockets = getUserSockets(from);
  sockets.forEach((sid) => io.to(sid).emit("messages_read", { peerId: to }));
    } catch (e) {
      console.error("mark_read error", e);
    }
  });

  socket.on("disconnect", () => {
  const res = removeUserSocket(socket.id);
  if (res) {
    console.log(`Socket disconnected: ${socket.id} for user ${res.userId}`);
    if (res.nowOffline) io.emit("user_offline", { userId: res.userId });
    if (res.nowOffline) {
      // Update lastSeen for the user who just went offline
      User.findByIdAndUpdate(res.userId, { $set: { lastSeen: new Date() } }).catch(() => {});
    }
  }
  });

  // WebRTC signaling: voice/video calls
  socket.on("call_user", ({ to, from, offer, callType, icePrefs }) => {
    try {
  const receiverSockets = getUserSockets(to);
  if (!receiverSockets.length) {
        socket.emit("call_unavailable", { to });
        // Log unavailable
        CallLog.create({ from, to, callType, status: "unavailable", startedAt: new Date(), endedAt: new Date() }).catch(()=>{});
        return;
      }
      // Create a ringing log
      CallLog.create({ from, to, callType, status: "ringing", startedAt: new Date() }).catch(()=>{});
  receiverSockets.forEach((sid) => io.to(sid).emit("incoming_call", { from, offer, callType, icePrefs }));
    } catch (e) {
      console.error("call_user error", e);
    }
  });
  // Allow caller to set ICE preferences on callee (runtime override)
  socket.on("ice_prefs", ({ to, from, prefs }) => {
    try {
      const sockets = getUserSockets(to);
      sockets.forEach((sid) => io.to(sid).emit("ice_prefs", { from, prefs }));
    } catch (e) {
      console.error("ice_prefs error", e);
    }
  });

  socket.on("answer_call", ({ to, from, answer }) => {
    try {
  const callerSockets = getUserSockets(to);
      // Update latest ringing log between these two users to answered
      CallLog.findOneAndUpdate(
        { from: to, to: from, status: { $in: ["ringing"] } },
        { status: "answered", answeredAt: new Date() },
        { sort: { createdAt: -1 } }
      ).catch(()=>{});
  callerSockets.forEach((sid) => io.to(sid).emit("call_answer", { from, answer }));
    } catch (e) {
      console.error("answer_call error", e);
    }
  });

  socket.on("ice_candidate", ({ to, from, candidate }) => {
    try {
      const sockets = getUserSockets(to);
      sockets.forEach((sid) => io.to(sid).emit("ice_candidate", { from, candidate }));
    } catch (e) {
      console.error("ice_candidate error", e);
    }
  });

  // Support renegotiation/ICE restart
  socket.on("renegotiate_offer", ({ to, from, offer }) => {
    try {
      const sockets = getUserSockets(to);
      sockets.forEach((sid) => io.to(sid).emit("renegotiate_offer", { from, offer }));
    } catch (e) {
      console.error("renegotiate_offer error", e);
    }
  });
  socket.on("renegotiate_answer", ({ to, from, answer }) => {
    try {
      const sockets = getUserSockets(to);
      sockets.forEach((sid) => io.to(sid).emit("renegotiate_answer", { from, answer }));
    } catch (e) {
      console.error("renegotiate_answer error", e);
    }
  });

  socket.on("end_call", ({ to, from }) => {
    try {
      const sockets = getUserSockets(to);
      sockets.forEach((sid) => io.to(sid).emit("call_ended", { from }));
      socket.emit("call_ended", { from });
      // Mark latest call between the two as ended
      CallLog.findOneAndUpdate(
        { $or: [ { from, to }, { from: to, to: from } ], status: { $in: ["ringing", "answered"] } },
        { status: "ended", endedAt: new Date() },
        { sort: { createdAt: -1 } }
      ).catch(()=>{});
    } catch (e) {
      console.error("end_call error", e);
    }
  });

  socket.on("reject_call", ({ to, from }) => {
    try {
      const sockets = getUserSockets(to);
      sockets.forEach((sid) => io.to(sid).emit("call_rejected", { from }));
      // Mark latest call as rejected (missed)
      CallLog.findOneAndUpdate(
        { from: to, to: from, status: { $in: ["ringing"] } },
        { status: "rejected", endedAt: new Date() },
        { sort: { createdAt: -1 } }
      ).catch(()=>{});
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