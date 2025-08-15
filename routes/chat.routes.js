// routes/chat.routes.js
import { Router } from "express";
import { getHistory, getInbox, markRead, sharePost } from "../controllers/chat.controller.js";

// If you already have an auth middleware, plug it in here:
import isAuth from "../middlewares/isAuth.js";

const router = Router();


router.post("/share-post", isAuth, sharePost);
router.get("/history/:withUser", isAuth, getHistory);
router.get("/inbox", isAuth, getInbox);
router.patch("/read/:withUser", isAuth, markRead);

export default router;
