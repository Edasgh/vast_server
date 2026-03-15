import mongoose from "mongoose";

const ProjectSchema = new mongoose.Schema({
    name: { type: String, default: 'New Vast Project', trim: true, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [
        { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    ],
    // The 'elements' array (array of ids)
    scene: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Element' }],
    settings: {
        canvasWidth: { type: Number, default: 3000 },
        canvasHeight: { type: Number, default: 2000 }
    }
},
    { timestamps: true });

const Project = mongoose.models.Project ?? mongoose.model("Project", ProjectSchema);

export default Project;
