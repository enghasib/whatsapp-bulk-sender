import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import path from "path";
import apiRouter from "./routes/api";
import { whatsappManager } from "./whatsapp";

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api", apiRouter);

// Initialize WhatsApp manager with socket.io
whatsappManager.init(io);

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.emit("status", whatsappManager.getStatus());

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection caught globally at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception caught globally:", error);
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
