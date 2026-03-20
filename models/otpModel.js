import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: String, required: true },
    expiresAt: {
        type: Date,
        default: () => Date.now() + 10 * 60 * 1000, // 10 minutes
        index: { expires: 0 }, // auto delete when expiresAt is reached
    },
},{timestamps:true});

const OTP = mongoose.models.OTP ?? mongoose.model("OTP", otpSchema);

export default OTP;