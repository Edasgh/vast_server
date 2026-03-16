// server/index.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import mongoose, { isValidObjectId } from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import userRoutes from "./routes/userRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import Project from "./models/projectModel.js";
import Element from "./models/elementModel.js";
// import accessRequestRoutes from "./routes/accessRequestRoutes.js";
// import Scriible from "./models/scriibleModel.js";

dotenv.config();

const app = express();
app.use(cors({
  origin: process.env.CLIENT_BASE_URL || "http://localhost:5173", // frontend URL
  credentials: true,
}));
app.use(express.json()); // ⭐ REQUIRED to parse JSON body
app.use(express.urlencoded({ extended: true }));
const PORT = process.env.PORT || 8080;

app.use(cookieParser());
app.use("/api/auth", userRoutes);
app.use("/api/projects", projectRoutes);
// app.use("/api/requests", accessRequestRoutes);


const onlineUsers = {}
// structure:
// {
//   roomId: {
//      socketId: { userId, name }
//   }
// }


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // React app's URL
    methods: ["GET", "POST"],
    credentials: true
  },
});


io.on("connection", (socket) => {

  console.log("A user connected:", socket.id);

  socket.on("join", async ({ userId, roomId }) => {
    socket.join(roomId);
    console.log("joined room : ", roomId);
    if (!onlineUsers[roomId]) {
      onlineUsers[roomId] = {};
    }

    onlineUsers[roomId][socket.id] = {
      userId,
    };


    try {
      const projectId = roomId;

      if (!isValidObjectId(projectId)) {
        return socket.emit("load-project", { project: null, error: "Invalid Project ID" });
      }

      if (!projectId) {
        return socket.emit("load-project", { project: null, error: "Project ID is required" });
      }

      const project = await Project.findById(projectId).populate({
        path: "scene",
        options: { sort: { createdAt: 1 } }
      }).populate("participants", "_id name");

      if (!project) {
        return socket.emit("load-project", { project: null, error: "Project not found!" });
      }

      const isOwner = project.owner.equals(userId);
      const isParticipant = project.participants.some(
        (p) => p._id.toString() === userId
      );

      if (!isOwner && !isParticipant) {
        return socket.emit("load-project", { project: null, accessRequired: true });
      }

      const users = Object.values(onlineUsers[roomId] || {});

      const onlineSet = new Set(users.map((u) => u.userId));
      const participants = project.participants.map((p) => ({
        ...p.toObject(),
        status: onlineSet.has(p._id.toString()) ? "online" : "offline"
      }))
      const projectToSend = {
        ...project.toObject(),
        participants
      }


      socket.emit("load-project", { project: projectToSend });
      console.log({ message: "Project sent successfully!" });

    } catch (error) {
      console.error("Error in getting vast project:", error);
    }


  });

  socket.on("add-element", async ({ userId, projectId, element }) => {
    try {

      if (!projectId) {
        res.status(400);
        throw new Error("Project ID is required");
      }

      const project = await Project.findById(projectId);

      const isOwner = project.owner.equals(userId);
      const isParticipant = project.participants.includes(userId);

      if (!isOwner && !isParticipant) {
        res.status(403);
        throw new Error("You don't have permission to edit this.");
      }

      // 1️⃣ Create element document
      const newElement = await Element.create({ ...element, projectId });

      // 2️⃣ Store element id in scene
      await Project.findByIdAndUpdate(
        projectId,
        { $push: { scene: newElement._id } }
      );

      console.log({
        message: "Element added successfully",
      })

    } catch (error) {
      console.error("Incremental save error:", error);
    }
    socket.to(projectId).emit("element-added", { element, socketId: socket.id });
  });

  socket.on("undo-element", async ({ userId, projectId }) => {
    try {

      if (!projectId) {
        res.status(400);
        throw new Error("Project ID is required");
      }
      const project = await Project.findById(projectId);

      const isOwner = project.owner.equals(userId);
      const isParticipant = project.participants.includes(userId);

      if (!isOwner && !isParticipant) {
        res.status(403);
        throw new Error("You don't have permission to edit this.");
      }

      // Get last element ID
      const lastElementId = project.scene[project.scene.length - 1];

      if (!lastElementId) {
        return res.status(400).json({ error: "No elements to undo" });
      }

      // Remove from project
      await Project.findByIdAndUpdate(
        projectId,
        { $pop: { scene: 1 } }
      );

      // Delete element document
      await Element.findByIdAndDelete(lastElementId);

      console.log({ message: "Last element undone" });

    } catch (error) {
      console.error("Undo error:", error);

    }
    socket.to(projectId).emit("element-undone", { socketId: socket.id });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});




const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI);
    if (connection) {
      console.log(`Connected to database successfully!`);
    }
  } catch (error) {
    console.log(error.message);
    process.exit();
  }
};



server.listen(PORT, async () => {
  await connectDB();
  if (process.env.NODE_ENV === "production") console.log(`Scriible server running`);
  else
    console.log(`Server running on port : ${PORT}`);
});

