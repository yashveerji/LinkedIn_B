// models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, trim: true, default: "" },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
    // Attachment fields
    attachmentUrl: { type: String, default: "" },
    attachmentType: { type: String, enum: ["image", "file", ""], default: "" },
    attachmentName: { type: String, default: "" },
    attachmentMime: { type: String, default: "" },
    attachmentSize: { type: Number, default: 0 },
    attachmentWidth: { type: Number, default: 0 },
    attachmentHeight: { type: Number, default: 0 },
    deliveredAt: { type: Date, default: null },
    readAt:      { type: Date, default: null }
  },
  { timestamps: true }
);

messageSchema.index({ from: 1, to: 1, createdAt: -1 });

export default mongoose.model("Message", messageSchema);
