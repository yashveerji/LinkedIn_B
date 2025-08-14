// routes/chat.routes.js
import { Router } from "express";
import { getHistory, getInbox, markRead } from "../controllers/chat.controller.js";

// If you already have an auth middleware, plug it in here:
import requireAuth from "../middleware/requireAuth.js"; // <-- adapt path/name

const router = Router();

router.get("/history/:withUser", requireAuth, getHistory);
router.get("/inbox", requireAuth, getInbox);
router.patch("/read/:withUser", requireAuth, markRead);

export default router;
