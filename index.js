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
import notificationRouter from "./routes/notification.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import jobRoutes from "./routes/job.routes.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// Common CORS options (updated URLs)
const corsOptions = {
  origin: [
    "http://localhost:5173",                 // Local
    "https://g5team.netlify.app",            // Netlify
    "https://linkedin-f-8z9y.onrender.com"   // Render
  ],
  credentials: true
};

// Socket.IO server with same CORS config
export const io = new Server(server, { cors: corsOptions });

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));

// API routes
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/post", postRouter);
app.use("/api/connection", connectionRouter);
app.use("/api/notification", notificationRouter);
app.use("/api/jobs", jobRoutes);
app.use("/api/ai", aiRoutes);

// Map to store connected users: userId -> socketId
export const userSocketMap = new Map();

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("register", (userId) => {
    userSocketMap.set(userId, socket.id);
    console.log(`User registered: ${userId} -> ${socket.id}`);
  });

  socket.on("send_message", ({ senderId, receiverId, text }) => {
    const receiverSocketId = userSocketMap.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receive_message", {
        senderId,
        text,
        time: new Date().toLocaleTimeString(),
      });
    }
  });

  socket.on("disconnect", () => {
    for (let [userId, sId] of userSocketMap.entries()) {
      if (sId === socket.id) {
        userSocketMap.delete(userId);
        console.log(`User disconnected: ${userId}`);
        break;
      }
    }
  });
});

// Start server
const port = process.env.PORT || 5000;
server.listen(port, () => {
  connectDb();
  console.log(`Server started on port ${port}`);
});