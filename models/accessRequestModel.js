import mongoose from "mongoose";

const AccessRequestSchema = new mongoose.Schema({
    message: { type: String, required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reciever: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', required: true },
},
    { timestamps: true });


const AccessRequest = mongoose.models.AccessRequest ?? mongoose.model("AccessRequest", AccessRequestSchema);

export default AccessRequest;
