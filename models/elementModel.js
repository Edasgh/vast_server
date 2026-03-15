import mongoose from "mongoose";

const ElementSchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    type: { type: String, enum: ['path', 'image'], required: true },
    mode: { type: String, enum: ['brush', 'eraser'] },
    color: { type: String },
    // For paths: an array of coordinate objects
    points: [{
        x: Number,
        y: Number
    }],
    // For images: The ImageData is a image url here 
    imageData: { type: String },
    x: { type: Number },
    y: { type: Number },
    height: { type: Number },
    width: { type: Number },

},
    { timestamps: true });


const Element = mongoose.models.Element ?? mongoose.model("Element", ElementSchema);

export default Element;
