import mongoose from "mongoose";

const AccessRequestSchema = new mongoose.Schema({
    message: { type: String, required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', required: true },
},
    { timestamps: true });

// 1️⃣ Index for Pending requests: Delete after 10 days
AccessRequestSchema.index(
    { updatedAt: 1 },
    {
        expireAfterSeconds: 60 * 60 * 24 * 10, // 10 days
        partialFilterExpression: { status: 'pending' },
        name: "pending_ttl_10d" // Custom name is good practice
    }
);

// 2️⃣ Index for Accepted/Rejected: Delete after 1 day
AccessRequestSchema.index(
    { updatedAt: 1 },
    {
        expireAfterSeconds: 60 * 60 * 24, // 1 day
        partialFilterExpression: { status: { $in: ['accepted', 'rejected'] } },
        name: "acted_ttl_1d"
    }
);

const AccessRequest = mongoose.models.AccessRequest ?? mongoose.model("AccessRequest", AccessRequestSchema);

export default AccessRequest;
