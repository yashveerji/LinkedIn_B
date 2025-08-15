
import express from "express"
import isAuth from "../middlewares/isAuth.js"
import upload from "../middlewares/multer.js"
import { comment, createPost, getPost, like, deletePost, deleteComment, repost } from "../controllers/post.Controllers.js"

const postRouter=express.Router()
postRouter.post("/repost/:id", isAuth, repost);


postRouter.post("/create",isAuth,upload.single("image"),createPost)
postRouter.get("/getpost",isAuth,getPost)
postRouter.post("/like/:id",isAuth,like)
postRouter.post("/comment/:id",isAuth,comment)
postRouter.delete("/delete/:id", isAuth, deletePost);
postRouter.delete("/comment/:postId/:commentId", isAuth, deleteComment);


export default postRouter