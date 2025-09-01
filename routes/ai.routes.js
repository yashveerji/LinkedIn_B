   
import express from "express";
import { getRes, chatRes, aiHealth } from "../controllers/ai.controller.js";

const router = express.Router();

router.post("/get-res", getRes);
router.post("/chat", chatRes);
router.get("/health", aiHealth);

export default router;
