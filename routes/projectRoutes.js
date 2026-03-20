import express from "express";

import async_handler from "express-async-handler";
import Project from "../models/projectModel.js";
import protect from "../middlewares/authMiddleware.js";
import User from "../models/userModel.js";
import Element from "../models/elementModel.js";

const router = express.Router();

// Increase limit for large canvas data/images
router.use(express.json({ limit: '50mb' }));

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

// --- ROUTE 1: Metadata & Settings (Fast) ---
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


// --- ROUTE 2: Scene & Elements (Heavy) ---
// router.patch('/:id/scene', protect, async (req, res) => {
//     try {
//         const { scene } = req.body;
//         const projectId = req.params.id;

//         // Validation
//         if (!projectId) {
//             res.status(400);
//             throw new Error("Project ID is required")
//         }

//         const userId = req.user._id; // we have auth middleware
//         const project = await Project.findById(projectId);

//         const isOwner = project.owner.equals(userId);
//         const isParticipant = project.participants.includes(userId);

//         if (!isOwner && !isParticipant) {
//             res.status(403);
//             throw new Error("You don't have permission to edit this.")
//         }


//         // We only update the scene array here
//         const updatedProject = await Project.findByIdAndUpdate(
//             projectId,
//             { $set: { scene } }
//         );

//         if (!updatedProject) {
//             res.status(404);
//             throw new Error("Project not found")
//         }

//         res.status(200).json({ message: "Scene saved" });
//     } catch (err) {
//         console.error("Error in saving scene : ", err);
//         res.status(500).json({ error: "Failed to save scene" });
//     }
// });

// POST /api/projects/:id/elements
router.post('/:id/elements', protect, async_handler(async (req, res) => {
    try {
        const { element } = req.body;
        const projectId = req.params.id;

        if (!projectId) {
            res.status(400);
            throw new Error("Project ID is required");
        }

        const userId = req.user._id;
        const project = await Project.findById(projectId);

        // const isOwner = project.owner.equals(userId);
        const isParticipant = project.participants.includes(userId);

        if (!isParticipant) {
            res.status(403);
            throw new Error("You don't have permission to edit this.");
        }

        // 1️⃣ Create element document
        const newElement = await Element.create(element);

        // 2️⃣ Store element id in scene
        await Project.findByIdAndUpdate(
            projectId,
            { $push: { scene: newElement._id } }
        );

        res.status(201).json({
            message: "Element added successfully",
            element: newElement
        });

    } catch (error) {
        console.error("Incremental save error:", error);
        res.status(500).json({ error: "Failed to save element" });
    }
}));

// DELETE /api/projects/:id/elements/last
router.delete('/:id/elements/last', protect, async_handler(async (req, res) => {
    try {
        const projectId = req.params.id;

        if (!projectId) {
            res.status(400);
            throw new Error("Project ID is required");
        }

        const userId = req.user._id;
        const project = await Project.findById(projectId);

        // const isOwner = project.owner.equals(userId);
        const isParticipant = project.participants.includes(userId);

        if (!isParticipant) {
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

        res.status(200).json({ message: "Last element undone" });

    } catch (error) {
        console.error("Undo error:", error);
        res.status(500).json({ error: "Failed to undo element in DB" });
    }
}));





export default router;