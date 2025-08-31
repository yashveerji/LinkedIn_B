import mongoose from "mongoose";

const jobApplicationSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  resumeUrl: { type: String },
  resumeName: { type: String },
  resumeMime: { type: String },
  resumeSize: { type: Number },
  status: { type: String, enum: ['submitted','reviewed','accepted','rejected'], default: 'submitted' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("JobApplication", jobApplicationSchema);
