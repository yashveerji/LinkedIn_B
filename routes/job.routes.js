import express from "express";
import Job from "../models/job.js";

const router = express.Router();

// Add Job
router.post("/add", async (req, res) => {
  try {
    const { title, company, location, description } = req.body;
    if (!title || !company || !location || !description) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const job = new Job({ title, company, location, description });
    await job.save();
    res.json({ message: "Job added successfully", job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all jobs
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find().sort({ datePosted: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
