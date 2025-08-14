   
import express from "express";
import { getRes } from "../controllers/ai.controller.js";

const router = express.Router();

router.post("/get-res", getRes);

export default router;
