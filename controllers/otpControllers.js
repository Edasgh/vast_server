import async_handler from "express-async-handler";
import crypto from "crypto";
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
            const timeDiff = Date.now() - otpExists.createdAt.getTime();

            if (timeDiff < COOLDOWN_TIME) {
                return res.status(429).json({
                    message: `Please wait ${Math.ceil((COOLDOWN_TIME - timeDiff) / 1000)} seconds before requesting another OTP`
                });
            }
            await OTP.deleteMany({ email });
        }

        // const otp = otpGenerator.generate(6, {
        //     digits: true,
        //     lowerCase: false,    // Added: Disables lowercase letters
        //     upperCase: false,
        //     specialChars: false,
        //     alphabets: false
        // });

        const otp = crypto.randomInt(100000, 999999).toString();

        const otpDoc = await OTP.create({ otp, email });

        const emailConfirmation = await sendEmail(user.name, email, otp);

        if (otpDoc && emailConfirmation) {
            return res.status(200).json({
                message: "OTP generated!"
            });
        }
    } catch (error) {
        return res.status(500).send({ message: error.message });

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

       return res.status(200).json({
            message: "OTP verified",
        });
    } catch (error) {
        return res.status(500).send({ message: error.message })

    }

});


export {
    sendOTP,
    verifyOTP
};