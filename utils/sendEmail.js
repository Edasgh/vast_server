import nodemailer from "nodemailer";
import dotenv from "dotenv";



dotenv.config();

const sendEmail = async (username, email, otp) => {

    const html = `
    <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:30px;">
    <div style="max-width:500px; margin:auto; background:#ffffff; padding:30px; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
        <h2 style="color:#333;">Password Recovery</h2>
        <p style="color:#555; font-size:15px;">
        Hi <b>${username}</b>,
        </p>
        <p style="color:#555; font-size:15px;">
        We received a request to reset your <b>Vast</b> account password.
        Please use the OTP below to proceed.
        </p>
        <div style="
        margin:25px 0;
        text-align:center;
        font-size:28px;
        letter-spacing:6px;
        font-weight:bold;
        color:#2563eb;
        background:#f1f5ff;
        padding:15px;
        border-radius:8px;
        ">
        ${otp}
        </div>
        <p style="color:#555; font-size:14px;">
        This OTP will expire in <b>10 minutes</b>. Please do not share this code with anyone.
        </p>
        <p style="color:#555; font-size:14px;">
        If you did not request this password reset, you can safely ignore this email.
        </p>
        <hr style="margin:25px 0; border:none; border-top:1px solid #eee;" />
        <p style="font-size:13px; color:#888;">
        Best regards,<br/>
        <b>Vast Team</b>
        </p>
    </div>
    </div>
`;

    const text = `
        Hi ${username},

        We received a request to reset your Vast account password.

        Your OTP is: ${otp}

        This OTP will expire in 10 minutes. Please do not share this code with anyone.

        If you did not request a password reset, please ignore this email.

        Best regards,
        Vast Team
`;

    const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 587,
        auth: {
            user: process.env.GOOGLE_ACCOUNT_USER,
            pass: process.env.GOOGLE_ACCOUNT_PASS,
        },
    });

    const info = await transporter.sendMail({
        from: process.env.EMAIL,
        to: email,
        subject: "Vast Password Recovery OTP",
        text: text,
        html: html
    });

    if (info.accepted) {
        return true;
    } else if (info.rejected) {
        return false;
    }



};

export default sendEmail;