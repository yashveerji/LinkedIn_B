import express from "express";
import Job from "../models/job.js";
import isAuth from "../middlewares/isAuth.js";

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
