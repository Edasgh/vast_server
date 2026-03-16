// server/index.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import userRoutes from "./routes/userRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
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


const strokeBuffers = new Map();
const strokeDirty = new Map();
const undoBuffers = new Map();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_BASE_URL || "http://localhost:5173", // React app's URL
        methods: ["GET", "POST"],
        credentials: true
    },
});


/*

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.on("join-room", async ({ docId, userId }) => {

    socket.join(docId);

    const doc = await Scriible.findById(docId);

    if (!doc) {
      socket.emit("load-strokes", { savedStrokes: [], accessRequired: false });
      return;
    }

    if (!doc.participants.includes(userId)) {
      socket.emit("load-strokes", { savedStrokes: [], accessRequired: true });
      return;
    }

    // initialize buffers
    if (!strokeBuffers.has(docId)) {
      // strokeBuffers.set(docId, [...(doc?.strokes || [])]);
      strokeBuffers.set(docId, [...(doc?.strokes || [])]);
      undoBuffers.set(docId, []);
      strokeDirty.set(docId, false);
    }

    // if (!undoBuffers.has(docId)) {
    //   undoBuffers.set(docId, []);
    // }

    socket.emit("load-strokes", {
      savedStrokes: strokeBuffers.get(docId) || [],
      accessRequired: false
    });

  });

  socket.on("save", async (docId) => {

    const strokes = strokeBuffers.get(docId) || [];

    try {

      if (strokes.length === 0) {
        io.to(docId).emit("saved", {
          success: false,
          message: "Nothing to save"
        });
        return;
      }

      await Scriible.findByIdAndUpdate(
        docId,
        { $set: { strokes } },
        { returnDocument: 'after' }
      );
      strokeDirty.set(docId, false); // reset dirty flag
      console.log(`Saved ${strokes.length} strokes for Scriible ${docId}`);

      io.to(docId).emit("saved", { success: true });

    } catch (error) {

      console.error("Batch save error:", error);

      io.to(docId).emit("saved", { success: false });

    }

  });

  socket.on("draw", (data) => {

    const { id } = data;

    socket.to(id).emit("draw", data);

    if (!strokeBuffers.has(id)) {
      strokeBuffers.set(id, []);
    }

    if (!undoBuffers.has(id)) {
      undoBuffers.set(id, []);
    }

    // const strokes = strokeBuffers.get(id);

    // strokes.push([{
    //   x0: data.x0,
    //   y0: data.y0,
    //   x1: data.x1,
    //   y1: data.y1,
    //   color: data.color,
    //   size: data.size
    // }]);


    // add segment to last stroke if exists
    const buffer = strokeBuffers.get(id);

    if (buffer.length === 0 || !Array.isArray(buffer[buffer.length - 1])) {
      // start a new stroke
      buffer.push([{
        x0: data.x0,
        y0: data.y0,
        x1: data.x1,
        y1: data.y1,
        color: data.color,
        size: data.size
      }]);
    } else {
      // append to last stroke
      buffer[buffer.length - 1].push({
        x0: data.x0,
        y0: data.y0,
        x1: data.x1,
        y1: data.y1,
        color: data.color,
        size: data.size
      });
    }

    // mark as dirty
    strokeDirty.set(id, true);

    // drawing clears redo
    undoBuffers.set(id, []);

  });

  socket.on("undo", (roomId) => {

    // const strokes = strokeBuffers.get(roomId);
    // if (!strokes || strokes.length === 0) return;

    // const removed = strokes.pop();

    // if (!undoBuffers.has(roomId)) {
    //   undoBuffers.set(roomId, []);
    // }

    // undoBuffers.get(roomId).push(removed);

    // io.to(roomId).emit("undo", removed);


    const buffer = strokeBuffers.get(roomId);
    if (!buffer || buffer.length === 0) return;

    const removed = buffer.pop();
    if (!undoBuffers.has(roomId)) undoBuffers.set(roomId, []);
    undoBuffers.get(roomId).push(removed);

    io.to(roomId).emit("undo", removed);



  });

  socket.on("redo", (roomId) => {

    // if (!undoBuffers.has(roomId)) return;

    // const redoStack = undoBuffers.get(roomId);

    // if (redoStack.length === 0) return;

    // const stroke = redoStack.pop();

    // if (!strokeBuffers.has(roomId)) {
    //   strokeBuffers.set(roomId, []);
    // }

    // strokeBuffers.get(roomId).push(stroke);

    // io.to(roomId).emit("redo", stroke);


    if (!undoBuffers.has(roomId)) return;
    const redoStack = undoBuffers.get(roomId);
    if (redoStack.length === 0) return;

    const stroke = redoStack.pop();
    strokeBuffers.get(roomId).push(stroke);

    io.to(roomId).emit("redo", stroke);

  });

  socket.on("clear-canvas", async ({ id }) => {

    socket.to(id).emit("clear-canvas");

    strokeBuffers.set(id, []);

    await Scriible.findByIdAndUpdate(id, {
      $set: { strokes: [] }
    });

  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

*/


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

