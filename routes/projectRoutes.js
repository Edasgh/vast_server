import express from "express";

import async_handler from "express-async-handler";
import Project from "../models/projectModel.js";
import protect from "../middlewares/authMiddleware.js";
import User from "../models/userModel.js";
import Element from "../models/elementModel.js";
import { io } from "../index.js";

const router = express.Router();

// Increase limit for large canvas data/images
router.use(express.json({ limit: '50mb' }));

// create a project
router.post("/create", protect, async_handler(async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user._id;

        const userExists = await User.findById(userId);
        if (!userExists) {
            res.status(403);
            throw new Error("You don't have permission to create project!")
        }

        const newProject = await Project.create({ name, owner: userId, participants: [userId] });

        if (newProject) {
            const updatedUser = await User.findByIdAndUpdate(userId,
                { $push: { projects: newProject._id } }
            )
            if (updatedUser) {
                // emit update
                io.to("admin-room").emit("admin:stats:update");
                return res.status(201).json({
                    _id: newProject._id,
                    name: newProject.name,
                    success: true,
                });
            } else {
                res.status(401);
                throw new Error("Unauthorized");
            }
        } else {
            res.status(400);
            throw new Error("Project creation failed!");
        }


    } catch (error) {
        console.error("Project creation Error:", error);
        res.status(500).json({ error: "Internal server error during project creation!" });
    }
}));

// get all projects for a particular user
router.get("/", protect, async_handler(async (req, res) => {
    try {
        const userId = req.user._id;
        const projects = await Project.find({
            participants: { $in: [userId] }
        }).populate({
            path: "scene",
            options: { sort: { createdAt: 1 } }
        }).populate("participants", "_id name");

        if (!projects) {
            res.status(404);
            throw new Error("Projects not found!");
        }

        return res.status(200).json({ projects });

    } catch (error) {
        console.error("Error in getting vast projects:", error);
        res.status(500).json({ error: "Failed to get vast projects!" });
    }
}));

// get a specific project
router.get("/:id", protect, async_handler(async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user._id;

        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required" });
        }

        const project = await Project.findById(projectId).populate({
            path: "scene",
            options: { sort: { createdAt: 1 } }
        }).populate("participants", "_id name");

        if (!project) {
            res.status(404);
            throw new Error("Project not found!");
        }

        const isOwner = project.owner.equals(userId);
        const isParticipant = project.participants.includes(userId);

        if (!isOwner && !isParticipant) {
            res.status(403);
            throw new Error("You don't have permission to view this.");
        }

        return res.status(200).json({ project });

    } catch (error) {
        console.error("Error in getting vast project:", error);
        res.status(500).json({ error: "Failed to get vast project!" });
    }
}));

// --- Update Metadata & Settings (Fast) ---
router.patch('/:id/settings', protect, async_handler(async (req, res) => {
    try {
        const { name, settings } = req.body;
        const projectId = req.params.id;

        // Validation
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required" });
        }

        const userId = req.user._id; // we have auth middleware

        const project = await Project.findById(projectId);

        const isOwner = project.owner.equals(userId);
        const isParticipant = project.participants.includes(userId);

        if (!isOwner && !isParticipant) {
            res.status(403);
            throw new Error("You don't have permission to edit this.")
        }


        const updated = await Project.findByIdAndUpdate(
            projectId,
            { $set: { name, settings } },
            { returnDocument: 'after', runValidators: true }
        ).select('name settings'); // Don't return the heavy scene data


        if (!updated) {
            res.status(404);
            throw new Error("Project not found")
        }

        res.status(200).json(updated);
    } catch (err) {
        console.error("Error in updating vast project settings : ", err);
        res.status(500).json({ error: "Failed to update settings" });
    }
}));


// delete a specific project
router.delete(
    "/:id",
    protect,
    async_handler(async (req, res) => {
        try {
            const projectId = req.params.id;
            const userId = req.user._id;

            if (!projectId) {
                return res.status(400).json({ message: "ProjectId is required!" });
            }

            const project = await Project.findById(projectId);

            if (!project) {
                return res.status(404).json({ message: "Project not found!" });
            }

            // 🔐 Authorization: owner OR admin
            const user = await User.findById(userId);

            const isOwner = project.owner.toString() === userId.toString();

            if (!isOwner && !user.isAdmin) {
                return res.status(403).json({ message: "Unauthorized!" });
            }

            //  Delete project
            await Project.findByIdAndDelete(projectId);

            //Delete all elements
            await Element.deleteMany({ projectId });

            //  Remove project from all users
            await User.updateMany(
                { projects: { $in: [projectId] } },
                { $pull: { projects: projectId } }
            );

            io.to("admin-room").emit("admin:stats:update");
            return res.status(200).json({
                message: "Project deleted successfully",
                projectId,
            });

        } catch (err) {
            console.log("Error while deleting project:", err);
            return res.status(500).json({ message: err.message });
        }
    })
);







export default router;