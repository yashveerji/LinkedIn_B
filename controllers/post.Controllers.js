// Repost a post (clone for current user)
export const repost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.userId;
        const originalPost = await Post.findById(postId);
        if (!originalPost) return res.status(404).json({ message: "Original post not found" });
        // Create a new post with the same content and image, but new author, and track original author
        const newPost = await Post.create({
            author: userId,
            repostedFrom: originalPost.author,
            description: originalPost.description,
            image: originalPost.image || undefined
        });
        return res.status(201).json({ message: "Reposted successfully", post: newPost });
    } catch (error) {
        return res.status(500).json({ message: `repost error ${error}` });
    }
};
// Delete a post (only by author)
export const deletePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.userId;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });
        if (post.author.toString() !== userId) return res.status(403).json({ message: "Not authorized" });
        await post.deleteOne();
        return res.status(200).json({ message: "Post deleted" });
    } catch (error) {
        return res.status(500).json({ message: `delete post error ${error}` });
    }
};

// Delete a comment (only by comment owner)
export const deleteComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const userId = req.userId;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });
        const comment = post.comment.id(commentId);
        if (!comment) return res.status(404).json({ message: "Comment not found" });
        if (comment.user.toString() !== userId) return res.status(403).json({ message: "Not authorized" });
        comment.remove();
        await post.save();
        return res.status(200).json({ message: "Comment deleted", commentId });
    } catch (error) {
        return res.status(500).json({ message: `delete comment error ${error}` });
    }
};
import Post from "../models/post.model.js"
import uploadOnCloudinary from "../config/cloudinary.js"
import { io } from "../index.js";
import Notification from "../models/notification.model.js";
export const createPost=async (req,res)=>{
    try {
        let {description}=req.body
        let newPost;
    if(req.file){
        let image=await uploadOnCloudinary(req.file.path)
         newPost=await Post.create({
            author:req.userId,
            description,
            image
        })
    }else{
        newPost=await Post.create({
            author:req.userId,
            description
        })
    }
return res.status(201).json(newPost)

    } catch (error) {
        return res.status(201).json(`create post error ${error}`)
    }
}


export const getPost = async (req, res) => {
    try {
        const post = await Post.find()
            .populate("author", "firstName lastName profileImage headline userName")
            .populate("comment.user", "firstName lastName profileImage headline")
            .populate("reactions.user", "firstName lastName profileImage userName")
            .sort({ createdAt: -1 });
        return res.status(200).json(post);
    } catch (error) {
        return res.status(500).json({ message: "getPost error" });
    }
};

export const like = async (req, res) => {
    try {
        let postId = req.params.id;
        let userId = req.userId;
        let { type } = req.body;
        if (!type) type = "like";
        let post = await Post.findById(postId);
        if (!post) {
            return res.status(400).json({ message: "post not found" });
        }
        // Remove previous reaction if exists
        post.reactions = post.reactions.filter(r => r.user.toString() !== userId);
        // Add new reaction
        post.reactions.push({ user: userId, type });
        if (post.author.toString() !== userId) {
            await Notification.create({
                receiver: post.author,
                type: "like",
                relatedUser: userId,
                relatedPost: postId
            });
        }
        await post.save();
        io.emit("likeUpdated", { postId, reactions: post.reactions });
        return res.status(200).json(post);
    } catch (error) {
        return res.status(500).json({ message: `like error ${error}` });
    }
};

export const comment=async (req,res)=>{
    try {
        let postId=req.params.id
        let userId=req.userId
        let {content}=req.body

        let post=await Post.findByIdAndUpdate(postId,{
            $push:{comment:{content,user:userId}}
        },{new:true})
        .populate("comment.user","firstName lastName profileImage headline")
        if(post.author!=userId){
        let notification=await Notification.create({
            receiver:post.author,
            type:"comment",
            relatedUser:userId,
            relatedPost:postId
        })
    }
        io.emit("commentAdded",{postId,comm:post.comment})
        return res.status(200).json(post)

    } catch (error) {
        return res.status(500).json({message:`comment error ${error}`})  
    }
}