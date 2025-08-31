   
import express from "express";
import { getRes, chatRes } from "../controllers/ai.controller.js";

const router = express.Router();

router.post("/get-res", getRes);
router.post("/chat", chatRes);

export default router;
