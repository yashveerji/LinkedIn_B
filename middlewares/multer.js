import multer from "multer";

// Use in-memory storage to avoid relying on local filesystem (works better on serverless/containers)
// Also allows direct streaming to Cloudinary without writing temp files.
const storage = multer.memoryStorage();

// Optional: set sane limits (e.g., 10MB)
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

export default upload;
