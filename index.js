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
import User from "./models/userModel.js";
import AccessRequest from "./models/accessRequestModel.js";
import protect from "./middlewares/authMiddleware.js";

dotenv.config();

const app = express();
app.use(cors({
  origin: process.env.CLIENT_BASE_URL || "http://localhost:5173", // frontend URL
  credentials: true,
}));
app.use(express.json()); // ⭐ REQUIRED to parse JSON body
app.use(express.urlencoded({ extended: true }));
const PORT = process.env.PORT || 8080;




const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // React app's URL
    methods: ["GET", "POST"],
    credentials: true
  },
});

const onlineUsers = {}
// structure:
// {
//   roomId: {
//      socketId: { userId, name }
//   }
// }



// POST /api/request-access
export const sendAccessRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { message, projectId } = req.body;

    const projectExists = await Project.findById(projectId);

    const isParticipant = projectExists.participants.some(
      (p) => p._id.toString() === userId
    );

    const requestExists = await AccessRequest.findOne({ projectId, sender: userId });

    if (!projectExists || isParticipant || requestExists) {
      res.status(404);
      throw new Error("Invalid request")
    }


    const request = await AccessRequest.create({
      message,
      projectId,
      sender: userId,
      receiver: projectExists.owner,
    });

    const requestToSend = await AccessRequest.findById(request._id).populate("sender").populate("projectId");

    if (!request || !requestToSend) {
      res.status(404);
      throw new Error("Failed to send request!");
    }

    // 🔥 Emit socket event here
    io.to(projectExists.owner.toString()).emit("get-request", {
      request: requestToSend,
    });

    return res.status(201).json({ success: true, request });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await AccessRequest.find({
      sender: userId, // user who should receive notif
    })
      .populate("projectId")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ notifications });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

app.use(cookieParser());
app.use("/api/auth", userRoutes);
app.use("/api/projects", projectRoutes);
app.post("/api/request-access", protect, sendAccessRequest);
app.get("/api/get-notifs", protect, getNotifications);


io.on("connection", (socket) => {

  console.log("A user connected:", socket.id);

  socket.on("join-personal", ({ userId }) => {
    if (!userId) return;

    if (!socket.rooms.has(userId)) {
      socket.join(userId);
    }
  });

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

      if (!isParticipant) {
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


      if (!isOwner) return;
      const roomNotifications = await AccessRequest.find({ projectId, reciever: userId.toString() });
      io.to(userId.toString()).emit("get-requests", { requests: roomNotifications });
      console.log({ message: "Requests got successfully!" });
    } catch (error) {
      console.error("Error in getting vast project and access requests :", error);
    }


  });

  socket.on("add-element", async ({ userId, projectId, element }) => {
    try {

      if (!projectId) {
        throw new Error("Project ID is required");
      }

      const project = await Project.findById(projectId);

      // const isOwner = project.owner.equals(userId);
      const isParticipant = project.participants.includes(userId);

      if (!isParticipant) {
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
        throw new Error("Project ID is required");
      }
      const project = await Project.findById(projectId);

      // const isOwner = project.owner.equals(userId);
      const isParticipant = project.participants.includes(userId);

      if (!isParticipant) {
        throw new Error("You don't have permission to edit this.");
      }

      // Get last element ID
      const lastElementId = project.scene[project.scene.length - 1];

      if (!lastElementId) {
        throw new Error("No elements to undo")
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

  socket.on("accept-request", async ({ userId, message, requestId, projectId }) => {
    try {
      const userExists = await User.findById(userId);

      if (!userExists) {
        throw new Error("Invalid request")
      }

      const project = await Project.findById(projectId);

      if (!project.owner.equals(userId)) {
        throw new Error("Not authorized");
      }

      const res = await AccessRequest.findByIdAndUpdate(requestId, {
        message,
        status: 'accepted'
      }, {
        returnDocument: 'after'
      }).populate("projectId").populate("sender");

      if (!res) {
        throw new Error("Request not found");
      }

      await Project.findByIdAndUpdate(projectId,
        { $addToSet: { participants: res.sender._id } }
      );

      io.to(res.sender._id.toString()).emit("get-notif", {
        request: res,
        accepted: true,
      });
    } catch (error) {
      console.error("Error while accepting request : ", error);
    }
  });

  socket.on("decline-request", async ({ userId, message, requestId, projectId }) => {
    try {
      const userExists = await User.findById(userId);
      if (!userExists) {
        throw new Error("Invalid request")
      }

      const project = await Project.findById(projectId);

      if (!project.owner.equals(userId)) {
        throw new Error("Not authorized");
      }

      const res = await AccessRequest.findByIdAndUpdate(requestId, {
        message,
        status: 'rejected'
      }, {
        returnDocument: 'after'
      }).populate("projectId").populate("sender");

      if (!res) {
        throw new Error("Request not found");
      }

      io.to(res.sender._id.toString()).emit("get-notif", {
        request: res,
        accepted: false,
      });


    } catch (error) {
      console.error("Error while rejecting request : ", error);
    }
  });

  socket.on("disconnect", () => {
    Object.keys(onlineUsers).forEach((roomId) => {
      delete onlineUsers[roomId][socket.id];

      // optional: cleanup empty rooms
      if (Object.keys(onlineUsers[roomId]).length === 0) {
        delete onlineUsers[roomId];
      }
    });
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

