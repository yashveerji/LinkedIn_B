import { Router } from "express";
import upload from "../middlewares/multer.js";
import isAuth from "../middlewares/isAuth.js";
import { uploadAttachment } from "../controllers/upload.controller.js";

const router = Router();

// Single file key: 'file'
router.post("/attachment", isAuth, upload.single("file"), uploadAttachment);

export default router;
