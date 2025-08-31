import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    callType: { type: String, enum: ["audio", "video"], required: true },
    status: { type: String, enum: ["ringing", "answered", "rejected", "ended", "missed", "unavailable"], default: "ringing" },
    startedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

callLogSchema.index({ from: 1, to: 1, startedAt: -1 });

export default mongoose.model("CallLog", callLogSchema);
