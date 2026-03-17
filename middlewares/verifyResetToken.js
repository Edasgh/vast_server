import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import dotenv from "dotenv";



dotenv.config();

const verifyResetToken = async (req, res, next) => {
    try {
        const token = req.cookies.resetToken;

        if (!token) {
            return res.status(401).json({ message: "Unauthorized. OTP not verified." });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id).select("-password").populate("projects", "name _id createdAt updatedAt").exec();

        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired reset token" });
    }
};

export default verifyResetToken