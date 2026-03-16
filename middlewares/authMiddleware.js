import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import dotenv from "dotenv";



dotenv.config();

const protect = async (req, res, next) => {

    let token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ message: "Not authorized" });
    }

    try {

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id).select("-password").populate("projects", "name _id createdAt updatedAt").exec();

        next();

    } catch (error) {
        res.status(401);
        throw new Error("Invalid token");
    }
};

export default protect;