import express from "express";
import protect from "../middlewares/authMiddleware.js";


import async_handler from "express-async-handler";
import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import generateToken from "../utils/generateToken.js";
import { sendOTP, verifyOTP } from "../controllers/otpControllers.js";
import verifyResetToken from "../middlewares/verifyResetToken.js";


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
    res.cookie("token", "", {
        httpOnly: true,
        expires: new Date(0),
    });

    res.status(200).json({ message: "Logged out" });
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
                res.status(201).send({ message: "Password changed successfully!" });
            }
        } else {
            res.status(401);
            throw new Error("Can't find User!");
        }
    } catch (error) {
        res.status(401);
        throw new Error(error.message);
    }
});

const router = express.Router();

router.post("/signup", registerUser)
router.post("/login", loginUser)
router.post("/logout", protect, logoutUser)
router.get("/", protect, getUser);
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


export default router;