import express from "express";
import Job from "../models/job.js";
import isAuth from "../middlewares/isAuth.js";
import JobApplication from "../models/jobApplication.js";
import Notification from "../models/notification.model.js";

const router = express.Router();

// Add Job (authenticated)
router.post("/add", isAuth, async (req, res) => {
  try {
    const { title, company, location, description } = req.body;
    if (!title || !company || !location || !description) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const job = new Job({
      title,
      company,
      location,
      description,
      createdBy: req.userId,
    });
    await job.save();
    res.json({ message: "Job added successfully", job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all jobs
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find().populate("createdBy", "_id userName firstName lastName").sort({ datePosted: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Edit Job (only by creator)
router.put("/edit/:id", isAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, company, location, description } = req.body;
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    if (job.createdBy.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized to edit this job" });
    }
    job.title = title || job.title;
    job.company = company || job.company;
    job.location = location || job.location;
    job.description = description || job.description;
    await job.save();
    res.json({ message: "Job updated successfully", job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete Job (only by creator)
router.delete("/delete/:id", isAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    if (job.createdBy.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized to delete this job" });
    }
    await job.deleteOne();
    res.json({ message: "Job deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;

// Job applications: submit application
router.post("/:id/apply", isAuth, async (req, res) => {
  try {
    const { id } = req.params;
  const { name, email, message, resumeUrl, resumeName, resumeMime, resumeSize } = req.body;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!name || !email || !message) return res.status(400).json({ message: "All fields are required" });
  const app = new JobApplication({ job: id, applicant: req.userId, name, email, message, resumeUrl, resumeName, resumeMime, resumeSize });
    await app.save();
    // Notify job owner
    try {
      await Notification.create({
        receiver: job.createdBy,
        type: 'jobApplication',
        relatedUser: req.userId,
        relatedJob: job._id,
      });
    } catch (e) { console.warn('Failed to create notification for job application', e?.message); }
    res.json({ message: "Application submitted", application: app });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Job applications: list for owner
router.get("/:id/applications", isAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.createdBy.toString() !== req.userId) return res.status(403).json({ message: "Not authorized" });
    const apps = await JobApplication.find({ job: id }).populate("applicant", "_id userName firstName lastName email").sort({ createdAt: -1 });
    res.json(apps);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update application status (owner only)
router.put("/:jobId/applications/:appId/status", isAuth, async (req, res) => {
  try {
    const { jobId, appId } = req.params;
    const { status } = req.body; // submitted | reviewed | accepted | rejected
    if (!['submitted','reviewed','accepted','rejected'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.createdBy.toString() !== req.userId) return res.status(403).json({ message: 'Not authorized' });
    const app = await JobApplication.findOne({ _id: appId, job: jobId });
    if (!app) return res.status(404).json({ message: 'Application not found' });
    app.status = status;
    await app.save();
    res.json({ message: 'Status updated', application: app });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
