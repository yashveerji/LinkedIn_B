import uploadOnCloudinary from "../config/cloudinary.js";

export const uploadAttachment = async (req, res) => {
	try {
		const file = req.file;
		if (!file) return res.status(400).json({ message: "No file uploaded" });
		// Cloudinary auto-detects resource type when using uploader.upload with resource_type: 'auto'
		const url = await uploadOnCloudinary(file.path);
		if (!url) return res.status(500).json({ message: "Failed to upload" });
		return res.json({ url });
	} catch (e) {
		console.error("uploadAttachment error", e);
		return res.status(500).json({ message: "Upload failed" });
	}
};
