import express from "express";
import protect from "../middlewares/authMiddleware.js";


import async_handler from "express-async-handler";
import User from "../models/userModel.js";
import Project from "../models/projectModel.js";
import bcrypt from "bcryptjs";
import generateToken from "../utils/generateToken.js";
import { sendOTP, verifyOTP } from "../controllers/otpControllers.js";
import verifyResetToken from "../middlewares/verifyResetToken.js";
import { io } from "../index.js";


//function to register user
const registerUser = async_handler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password || password.length < 8) {
        res.status(400);
        throw new Error("Please enter all the fields");
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error("User already exists!");
    }

    //create an User object in User model
    const newUser = await User.create({
        name,
        email,
        password,

    });

    if (newUser) {
        // emit update
        io.to("admin-room").emit("admin:stats:update");
        res.status(201).json({
            _id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            success: true,
        });
    } else {
        res.status(400);
        throw new Error("User creation failed!");
    }
});

//function to login user
const loginUser = async_handler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).populate("projects", "_id name createdAt updatedAt");

    if (user && (await user.matchPassword(password))) {
        generateToken(res, user._id);   // sets cookie
        res.status(200).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            projects: [...user.projects],
            isAdmin: user.isAdmin,
            dpUrl: user.dpUrl,
            success: true,
        });
    } else {
        res.status(400);
        throw new Error("Invalid email or password");
    }
});

//logout user
const logoutUser = (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/",
    });
    res.status(200).json({ message: "Logged out successfully" });
};

//function to view logged in user's details
const getUser = async_handler(async (req, res) => {
    try {
        const user = req.user
        res.send(user);
    } catch (error) {
        res.status(401);
        throw new Error("Can't view user details");
    }
});


//function to edit logged in user's details
const updateUser = async_handler(async (req, res) => {
    try {
        const { name, email } = req.body;

        const userId = req.user._id;
        let user = await User.findById(userId).select("-password");

        let newUser = {};
        if (name) {
            newUser.name = name;
        }
        if (email) {
            newUser.email = email;
        }

        if (!user) {
            return res.status(404).send({ error: "User not found!" });
        } else {
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { $set: newUser },
                {
                    returnDocument: 'after',
                    populate: {
                        path: "projects",
                        select: "name _id createdAt updatedAt"
                    }
                }
            )
            io.to("admin-room").emit("admin:stats:update");
            res.status(201).send(updatedUser);
        }
    } catch (error) {
        res.status(401);
        throw new Error("Can't update user details");
    }
});


//function to change password || for logged in user
const changePassword = async_handler(async (req, res) => {
    try {
        const { oldPassword, password } = req.body;
        const userId = req.user._id;
        const user = await User.findById(userId);
        if (user && (await user.matchPassword(oldPassword))) {
            const salt = await bcrypt.genSalt(10);
            let newPassword = await bcrypt.hash(password, salt);
            let userPassword = await User.findByIdAndUpdate(
                { _id: userId },
                { password: newPassword }
            );
            if (userPassword) {
                io.to("admin-room").emit("admin:stats:update");
                res.status(201).send({ message: "Password changed successfully!" });
            }
        } else {
            res.status(401);
            throw new Error("Failed to change password!");
        }
    } catch (error) {
        res.status(401)
        throw new Error(error.message);
    }
});


const forgotPassword = async_handler(async (req, res) => {
    try {
        const { password } = req.body; //without token , access via email
        const user = req.user;
        const userId = req.user._id;
        if (user) {
            const salt = await bcrypt.genSalt(10);
            let newPassword = await bcrypt.hash(password, salt);
            let userPassword = await User.findByIdAndUpdate(
                userId,
                { password: newPassword }
            );
            if (userPassword) {
                // clear token after use
                res.clearCookie("resetToken");
                return res.status(201).send({ message: "Password changed successfully!" });
            }
        } else {
            res.status(401);
            throw new Error("Can't find User!");
        }
    } catch (error) {
       return res.status(401).send({message:error.message})
    }
});

const router = express.Router();

router.post("/signup", registerUser)
router.post("/login", loginUser)
router.post("/logout", protect, logoutUser)
router.get("/", protect, getUser);
router.get("/admin/admin_data", protect, async_handler(async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select("-password");
        if (!user || !user?.isAdmin) {
            return res.status(401).send({ message: "Unauthorized!" });
        }

        // =========================
        // DATE HELPERS
        // =========================
        const last7Days = new Date();
        last7Days.setDate(last7Days.getDate() - 7);

        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);

        const allUsersPromise = User.find({}).populate("projects");

        const allProjectsPromise = Project.find({}).populate("participants").populate("owner");



        // =========================
        // ACTIVE USERS (last 7 days)
        // =========================

        const activeUsersPromise = User.countDocuments({
            updatedAt: { $gte: last7Days }
        });

        // =========================
        // INACTIVE USERS (last 30 days) 
        // =========================
        const inactiveUsersPromise = User.countDocuments({
            updatedAt: { $lt: last30Days }
        });

        // =========================
        // AVG ELEMENTS PER PROJECT
        // =========================
        const avgElementsPromise = Project.aggregate([
            {
                $project: {
                    elementCount: { $size: "$scene" }
                }
            },
            {
                $group: {
                    _id: null,
                    avg: { $avg: "$elementCount" }
                }
            }
        ]);

        // =========================
        // COLLABORATION STATS 
        // =========================
        const collaborationStatsPromise = Project.aggregate([
            {
                $project: {
                    participantsCount: { $size: "$participants" }
                }
            },
            {
                $group: {
                    _id: null,
                    avgParticipants: { $avg: "$participantsCount" }
                }
            }
        ]);


        // =========================
        // TOP USERS (by projects)
        // =========================
        const topUsersPromise = User.aggregate([
            {
                $project: {
                    name: 1,
                    email: 1,
                    dpUrl: 1,
                    projectCount: { $size: "$projects" }
                }
            },
            { $sort: { projectCount: -1 } },
            { $limit: 5 }
        ]);

        // =========================
        // HEAVY PROJECTS (by elements)
        // =========================
        const heavyProjectsPromise = Project.aggregate([
            {
                $project: {
                    name: 1,
                    elementCount: { $size: "$scene" },
                    participantsCount: { $size: "$participants" }
                }
            },
            { $sort: { elementCount: -1 } },
            { $limit: 5 }
        ]);

        // =========================
        // USER GROWTH (last 30 days) 
        // =========================
        const userGrowthPromise = User.aggregate([
            {
                $match: { createdAt: { $gte: last30Days } }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt"
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // =========================
        // PROJECT GROWTH (last 30 days) 
        // =========================
        const projectGrowthPromise = Project.aggregate([
            {
                $match: { createdAt: { $gte: last30Days } }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt"
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);


        // =========================
        // RUN IN PARALLEL
        // =========================
        const [
            allUsers,
            allProjects,
            activeUsers,
            inactiveUsers,
            avgElementsResult,
            collaborationStats,
            topUsers,
            heavyProjects,
            userGrowth,
            projectGrowth
        ] = await Promise.all([
            allUsersPromise,
            allProjectsPromise,
            activeUsersPromise,
            inactiveUsersPromise,
            avgElementsPromise,
            collaborationStatsPromise,
            topUsersPromise,
            heavyProjectsPromise,
            userGrowthPromise,
            projectGrowthPromise
        ]);

        return res.status(200).json({
            allUsers,
            allProjects,

            // Core stats
            activeUsers,
            inactiveUsers,

            avgElements: avgElementsResult[0]?.avg || 0,
            avgParticipants: collaborationStats[0]?.avgParticipants || 0,

            // Insights
            topUsers,
            heavyProjects,

            // Growth
            userGrowth,
            projectGrowth
        });

    } catch (err) {
        console.log("Error while getting admin dashboard data:", err);
        return res.status(500).send({ message: err.message });
    }
})
);


router.put("/edit_details", protect, updateUser);
router.put("/change_password", protect, changePassword);
router.post("/send_otp", sendOTP);
router.post("/verify_email", verifyOTP);
router.post("/reset_password", verifyResetToken, forgotPassword);
router.patch("/update_dp", protect, async_handler(async (req, res) => {
    try {
        const { imageUrl, dpStorageId } = req.body;

        const userId = req.user._id;

        const updatedUser = await User.findByIdAndUpdate(userId, {
            dpUrl: imageUrl,
            dpStorageId
        }, {
            returnDocument: 'after',
            populate: {
                path: "projects",
                select: "name _id createdAt updatedAt"
            }
        });
        if (updatedUser) {
            res.status(201).send(updatedUser);
        } else {
            throw new Error("User not found!")
        }
    } catch (error) {
        res.status(401).send({ message: error.message })

    }
}))

// delete a specific user
router.delete(
    "/:id",
    protect,
    async_handler(async (req, res) => {
        try {
            const deluserId = req.params.id;
            const userId = req.user._id;

            if (!deluserId) {
                return res.status(400).json({ message: "User Id is required!" });
            }

            const userExists = await User.findById(deluserId);

            if (!userExists) {
                return res.status(404).json({ message: "User not found!" });
            }

            // 🔐 Authorization: owner OR admin
            const user = await User.findById(userId);

            if (!user || !user?.isAdmin) {
                return res.status(403).json({ message: "Unauthorized!" });
            }


            //  Delete User
            await User.findByIdAndDelete(deluserId);

            //  Remove user from all projects
            await Project.updateMany(
                { participants: { $in: [deluserId] } },
                { $pull: { participants: deluserId } }
            );
            // Handle owned projects
            const ownedProjects = await Project.find({ owner: deluserId });

            for (const project of ownedProjects) {
                if (project.participants.length > 0) {
                    const newOwner = project.participants[0];

                    await Project.findByIdAndUpdate(project._id, {
                        owner: newOwner,
                        $pull: { participants: newOwner },
                    });

                } else {
                    await Project.findByIdAndDelete(project._id);
                }
            }

            io.to("admin-room").emit("admin:stats:update");
            return res.status(200).json({
                message: "User deleted successfully",
                deluserId,
            });

        } catch (err) {
            console.log("Error while deleting user :", err);
            return res.status(500).json({ message: err.message });
        }
    })
);


export default router;