import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userModel = mongoose.Schema(
    {
        name: { type: String, required: true, maxlength: 60 },
        email: { type: String, required: true, unique: true },
        projects: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Project"
            }
        ],
        password: { type: String, required: true, minlength: 8 },
        isAdmin: { type: Boolean, default: false },
        dpUrl: { type: String, default:"https://img.daisyui.com/images/profile/demo/yellingcat@192.webp"},
        dpStorageId: { type: String, default:"-1"}

    },
    { timestamps: true }
);

userModel.methods.matchPassword = async function (enteredPW) {
    return await bcrypt.compare(enteredPW, this.password);
};


userModel.pre("save", async function (next) {
    if (!this.isModified("password")) {
        next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.models.User ?? mongoose.model("User", userModel);

export default User;