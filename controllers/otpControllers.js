import async_handler from "express-async-handler";
import otpGenerator from "otp-generator";
import sendEmail from "../utils/sendEmail.js";
import User from "../models/userModel.js";
import OTP from "../models/otpModel.js";

import jwt from "jsonwebtoken";
import dotenv from "dotenv";


dotenv.config();

const COOLDOWN_TIME = 2 * 60 * 1000; // 2 minutes

const sendOTP = async_handler(async (req, res) => {

    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            res.status(404);
            throw new Error("User not found");
        }

        const otpExists = await OTP.findOne({ email });
        if (otpExists) {
            const timeDiff = Date.now() - existingOTP.createdAt.getTime();

            if (timeDiff < COOLDOWN_TIME) {
                return res.status(429).json({
                    message: `Please wait ${Math.ceil((COOLDOWN_TIME - timeDiff) / 1000)} seconds before requesting another OTP`
                });
            }
            await OTP.deleteMany({ email });
        }

        const otp = otpGenerator.generate(6, {
            digits: true,
            upperCase: false,
            specialChars: false
        });

        const otpDoc = await OTP.create({ otp, email });

        const emailConfirmation = await sendEmail(user.name, email, otp);

        if (otpDoc && emailConfirmation) {
            res.status(200).json({
                message: "OTP generated!"
            });
        }
    } catch (error) {
        res.status(500);
        throw new Error(error.message);
    }

});

const verifyOTP = async_handler(async (req, res) => {

    try {
        const { email, otp } = req.body;

        const otpDoc = await OTP.findOne({ email });

        if (!otpDoc || otpDoc.otp !== otp) {
            res.status(400);
            throw new Error("Invalid OTP");
        }

        if (otpDoc.otpExpire < Date.now()) {
            res.status(400);
            throw new Error("OTP expired");
        }

        const user = await User.findOne({ email });
        if (!user) {
            res.status(400);
            throw new Error("User not found!");
        }

        // generate temporary reset token
        const resetToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "10m" }
        );

        // store token in cookie
        res.cookie("resetToken", resetToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 10 * 60 * 1000
        });

        // delete OTP after verification
        await OTP.deleteMany({ email });

        res.status(200).json({
            message: "OTP verified",
        });
    } catch (error) {
        res.status(500);
        throw new Error(error.message);
    }

});


export {
    sendOTP,
    verifyOTP
};