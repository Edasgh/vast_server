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
  origin: process.env.CLIENT_BASE_URL, // frontend URL
  credentials: true,
}));
app.use(express.json()); // ⭐ REQUIRED to parse JSON body
app.use(express.urlencoded({ extended: true }));

// ✅ Create HTTP server and Socket.io
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_BASE_URL, // React app's URL
    methods: ["GET", "POST"],
    credentials: true
  },
});

export { io };

const onlineUsers = {}
// structure:
// {
//   roomId: {
//      socketId: { userId, name }
//   }
// }



// POST /api/request-access
const sendAccessRequest = async (req, res) => {
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
    // console.log("Error in sending request : ",err);
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

const getAdminNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await AccessRequest.find({
      reciever: userId, // user who should receive notif
      status: 'pending' // admin will accept or reject requests
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
app.get("/api/get_admin_notifs", protect, getAdminNotifications);




io.on("connection", (socket) => {

  console.log("A user connected:", socket.id);

  socket.on("join_admin", () => {
    socket.join("admin-room");
    io.to("admin-room").emit("admin:stats:update");
  })

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

      // Optimization: Pre-calculate online IDs to avoid multiple loops
      const onlineUserIds = new Set(Object.values(onlineUsers[roomId]).map(u => u.userId));

      const participantsWithStatus = project.participants.map(p => ({
        ...p.toObject(),
        status: onlineUserIds.has(p._id.toString()) ? "online" : "offline"
      }));
      const projectToSend = {
        ...project.toObject(),
        participants: participantsWithStatus
      }


      socket.emit("load-project", { project: projectToSend });
      console.log({ message: "Project sent successfully!" });
      socket.to(roomId).emit("updated_participants", { participants: participantsWithStatus })


      if (!isOwner) return;
      const roomNotifications = await AccessRequest.find({ projectId, receiver: userId.toString(), status: 'pending' }).populate("sender").populate("projectId");
      if (!roomNotifications) return;
      io.to(userId.toString()).emit("get-requests", { requests: roomNotifications });
      console.log({ message: "Requests got successfully!" });
    } catch (error) {
      console.error("Error in getting vast project and access requests :", error);
    }


  });

  socket.on("clear-canvas", async ({ userId, projectId }) => {
    try {
      if (!projectId) {
        throw new Error("Project ID is required");
      }

      const project = await Project.findById(projectId);

      // const isOwner = project.owner.equals(userId);
      const isParticipant = project.participants.some(
        (p) => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        throw new Error("You don't have permission to edit this.");
      }

      // 1. Delete all elements belonging to this project
      await Element.deleteMany({ projectId: projectId });

      // 2. Clear the 'scene' array in the Project document
      await Project.findByIdAndUpdate(projectId, {
        $set: { scene: [] }
      });
      // 3. Broadcast to EVERYONE in the room (including sender)
      // to reset their local React state
      io.to(projectId).emit("force-project-reload", { projectId });
      io.to("admin-room").emit("admin:stats:update");

      console.log(`Project ${projectId} cleared by  User ${userId}`);
    } catch (err) {
      console.error("Error clearing canvas:", err);
    }
  })

  socket.on("add-element", async ({ userId, projectId, element }) => {
    try {

      if (!projectId) {
        throw new Error("Project ID is required");
      }

      const project = await Project.findById(projectId);

      if (!project) {
        throw new Error("Project not found!");
      }

      const isParticipant = project.participants.some(
        (p) => p.toString() === userId.toString()
      );


      if (!isParticipant) {
        throw new Error("You don't have permission to edit this.");
      }

      const { _tempId, ...elementWithoutId } = element;

      // 1️⃣ Create element document
      const newElement = await Element.create({ ...elementWithoutId, projectId, userId });

      // 2️⃣ Store element id in scene
      await Project.findByIdAndUpdate(
        projectId,
        { $push: { scene: newElement._id } }
      );

      io.to(projectId).emit("element-added", { element: newElement, socketId: socket.id, _tempId });


      console.log({
        message: "Element added successfully",
      })


    } catch (error) {
      console.error("Incremental save error:", error);
    }

  });

  socket.on("update-element", async ({ userId, projectId, elementId, element }) => {
    try {
      // console.log("Project id : ",projectId);
      // console.log("Element id : ",elementId);
      if (!projectId || !elementId) {
        throw new Error("Project ID and Element ID are required");
      }

      const project = await Project.findById(projectId);
      if (!project) throw new Error("Project not found!");

      const isParticipant = project.participants.some(
        (p) => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        throw new Error("No permission");
      }

      const { _id, __v, createdAt, updatedAt, ...elementWithoutId } = element;

      const updatedElement = await Element.findByIdAndUpdate(
        elementId,
        { $set: elementWithoutId },
        { returnDocument: 'after' }
      );

      if (!updatedElement) {
        console.error("❌ Element not found in DB:", elementId);
        return;
      }

      console.log({ message: "Element updated successfully!" });

      socket.to(projectId).emit("element-updated", {
        element: updatedElement,
        socketId: socket.id,
      });

    } catch (err) {
      console.error("Element update error:", err);
    }
  });

  socket.on("undo-element", async ({ userId, projectId }) => {
    try {
      const project = await Project.findById(projectId);

      if (!project) throw new Error("Project not found");

      const isParticipant = project.participants.some(
        (p) => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        throw new Error("No permission");
      }

      // ✅ Find LAST element created by THIS USER
      const lastElement = await Element.findOne({
        projectId,
        userId,
      }).sort({ createdAt: -1 });

      if (!lastElement) {
        throw new Error("No elements to undo");
      }

      // ✅ Remove from project.scene
      await Project.findByIdAndUpdate(projectId, {
        $pull: { scene: lastElement._id },
      });

      // ✅ Delete element
      await Element.findByIdAndDelete(lastElement._id);

      // ✅ Emit WITH elementId (IMPORTANT)
      io.to(projectId).emit("element-undone", {
        elementId: lastElement._id,
        socketId: socket.id,
      });

      console.log({ message: "Last element undone" })

    } catch (error) {
      console.error("Undo error:", error);
    }
  });

  socket.on("delete-element", async ({ userId, projectId, elementId }) => {
    try {
      if (!projectId || !elementId) return;

      const project = await Project.findById(projectId);

      const isParticipant = project.participants.some(
        (p) => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        throw new Error("You don't have permission to edit this.");
      }

      // Remove from project
      await Project.findByIdAndUpdate(
        projectId,
        { $pull: { scene: elementId } }
      );

      await Element.findByIdAndDelete(elementId)


      socket.to(projectId).emit("element-deleted", {
        elementId,
        socketId: socket.id,
      });

      console.log({ message: "Element deleted successfully!" });

    } catch (err) {
      console.error("Delete error:", err);
    }
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

      const updatedProject = await Project.findByIdAndUpdate(projectId,
        { $addToSet: { participants: res.sender._id }, }, { returnDocument: 'after' }
      );

      await User.findByIdAndUpdate(res.sender._id,
        { $push: { projects: projectId } }
      )

      io.to(res.sender._id.toString()).emit("get-notif", {
        request: res,
        accepted: true,
      });

      // A. Notify the SENDER (Personal Room)
      // This tells the person who asked for access: "You're in! Reload now."
      io.to(res.sender._id.toString()).emit("force-project-reload", { projectId });

      // Optimization: Pre-calculate online IDs to avoid multiple loops
      const onlineUserIds = new Set(Object.values(onlineUsers[roomId]).map(u => u.userId));

      const participantsWithStatus = updatedProject.participants.map(p => ({
        ...p.toObject(),
        status: onlineUserIds.has(p._id.toString()) ? "online" : "offline"
      }));

      socket.emit("updated_participants", { participants: participantsWithStatus })

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

  // Helper function to keep your code DRY (Don't Repeat Yourself)
  const broadcastUpdatedParticipants = async (roomId) => {
    try {
      const project = await Project.findById(roomId).populate("participants", "_id name");
      if (!project) return;

      const onlineUserIds = new Set(
        Object.values(onlineUsers[roomId] || {}).map(u => u.userId)
      );

      const participantsWithStatus = project.participants.map(p => ({
        ...p.toObject(),
        status: onlineUserIds.has(p._id.toString()) ? "online" : "offline"
      }));

      // Send the fresh list to everyone still in the room
      io.to(roomId).emit("updated_participants", { participants: participantsWithStatus });
    } catch (err) {
      console.error("Error broadcasting disconnect update:", err);
    }
  };

  socket.on("disconnect", () => {
    // 1. Find all rooms this specific socket was active in
    const roomsUserWasIn = Object.keys(onlineUsers).filter(roomId =>
      onlineUsers[roomId][socket.id]
    );

    roomsUserWasIn.forEach((roomId) => {
      // 2. Remove the user from the state
      delete onlineUsers[roomId][socket.id];

      // 3. Check if the room still has people
      const remainingSocketIds = Object.keys(onlineUsers[roomId]);

      if (remainingSocketIds.length === 0) {
        delete onlineUsers[roomId];
      } else {
        // 4. Trigger the update for the remaining participants
        broadcastUpdatedParticipants(roomId);
      }
    });

    console.log("User disconnected and rooms updated:", socket.id);
  });


});


// const connectDB = async () => {
//   try {
//     const connection = await mongoose.connect(process.env.MONGO_URI);
//     if (connection) {
//       console.log(`Connected to database successfully!`);
//     }
//   } catch (error) {
//     console.log(error.message);
//     process.exit();
//   }
// };



// ✅ Connect to MongoDB first, then start server
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connected");

        server.listen(PORT, () => {
          if (process.env.NODE_ENV === "development"){
             console.log(`🚀 Server running on port ${PORT}`);
           }else{
            console.log("🚀 Vast server is running ! ")
           }
        });
    } catch (err) {
        console.error("❌ Failed to connect to MongoDB:", err);
        process.exit(1);
    }
};

startServer();

