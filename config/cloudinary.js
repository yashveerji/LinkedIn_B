import { v2 as cloudinary } from 'cloudinary';
import fs from "fs";
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

function ensureCloudinaryCreds() {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        throw new Error("Cloudinary credentials are missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.");
    }
}

// Upload from a local file path (legacy path-based flow)
async function uploadFilePath(filePath) {
    if (!filePath) return null;
    try {
        ensureCloudinaryCreds();
        const uploadResult = await cloudinary.uploader.upload(filePath, { resource_type: 'auto' });
        try { fs.unlinkSync(filePath); } catch {}
        return uploadResult.secure_url;
    } catch (error) {
        try { fs.unlinkSync(filePath); } catch {}
        console.log(error);
        throw error;
    }
}

// Upload from a Buffer (for multer.memoryStorage)
async function uploadBuffer(buffer, filename = 'upload') {
    if (!buffer) return null;
    try {
        ensureCloudinaryCreds();
        const res = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { resource_type: 'auto', filename_override: filename },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            stream.end(buffer);
        });
        return res.secure_url;
    } catch (error) {
        console.log(error);
        throw error;
    }
}

// Backwards-compatible default that accepts either a path string or a buffer
export default async function uploadOnCloudinary(input, filename) {
    if (!input) return null;
    if (Buffer.isBuffer(input)) {
        return uploadBuffer(input, filename);
    }
    if (typeof input === 'string') {
        return uploadFilePath(input);
    }
    // Try to detect multer file object
    if (input.buffer) {
        return uploadBuffer(input.buffer, input.originalname || filename);
    }
    return null;
}

export { uploadFilePath, uploadBuffer };