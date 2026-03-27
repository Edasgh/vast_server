import jwt from "jsonwebtoken";
import dotenv from "dotenv";



dotenv.config();


const generateToken = (res, userId) => {
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });

    res.cookie("token", token, {
        httpOnly: true,   // prevents JS access
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return token;
};

export default generateToken;