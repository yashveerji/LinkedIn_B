import Post from "../models/post.model.js";
import uploadOnCloudinary from "../config/cloudinary.js";
import { io } from "../index.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";

export const createPost = async (req, res) => {
    try {
        const { description } = req.body;
        let newPost;
        if (req.file) {
            const image = await uploadOnCloudinary(req.file.path);
            newPost = await Post.create({ author: req.userId, description, image });
        } else {
            newPost = await Post.create({ author: req.userId, description });
        }

        const populated = await Post.findById(newPost._id)
            .populate("author", "firstName lastName profileImage headline userName")
            .populate("repostedFrom", "firstName lastName profileImage headline userName")
            .populate("comment.user", "firstName lastName profileImage headline")
            .populate("reactions.user", "firstName lastName profileImage userName");

        io.emit("postCreated", populated);
        return res.status(201).json(populated);
    } catch (error) {
        return res.status(500).json({ message: `create post error ${error}` });
    }
};

export const getPost = async (req, res) => {
    try {
        const pageParam = req.query.page;
        const limitParam = req.query.limit;

        if (!pageParam && !limitParam) {
            const posts = await Post.find()
                .populate("author", "firstName lastName profileImage headline userName")
                .populate("repostedFrom", "firstName lastName profileImage headline userName")
                .populate("comment.user", "firstName lastName profileImage headline")
                .populate("reactions.user", "firstName lastName profileImage userName")
                .sort({ createdAt: -1 });
            return res.status(200).json(posts);
        }

        const page = Math.max(parseInt(pageParam || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(limitParam || "10", 10), 1), 50);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            Post.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("author", "firstName lastName profileImage headline userName")
                .populate("repostedFrom", "firstName lastName profileImage headline userName")
                .populate("comment.user", "firstName lastName profileImage headline")
                .populate("reactions.user", "firstName lastName profileImage userName"),
            Post.countDocuments()
        ]);

        const hasMore = page * limit < total;
        return res.status(200).json({ page, limit, total, hasMore, items });
    } catch (error) {
        return res.status(500).json({ message: "getPost error" });
    }
};

export const like = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.userId;
        let { type } = req.body;
        if (!type) type = "like";

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        const existing = (post.reactions || []).find(r => r.user.toString() === userId);
        if (existing && existing.type === type) {
            post.reactions = post.reactions.filter(r => r.user.toString() !== userId);
        } else {
            post.reactions = post.reactions.filter(r => r.user.toString() !== userId);
            post.reactions.push({ user: userId, type });
        }

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

export const comment = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.userId;
        const { content } = req.body;

        const post = await Post.findByIdAndUpdate(
            postId,
            { $push: { comment: { content, user: userId } } },
            { new: true }
        ).populate("comment.user", "firstName lastName profileImage headline");

        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.author.toString() !== userId) {
            await Notification.create({
                receiver: post.author,
                type: "comment",
                relatedUser: userId,
                relatedPost: postId
            });
        }

        io.emit("commentAdded", { postId, comm: post.comment });
        return res.status(200).json(post);
    } catch (error) {
        return res.status(500).json({ message: `comment error ${error}` });
    }
};

export const deletePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.userId;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });
        if (post.author.toString() !== userId) return res.status(403).json({ message: "Not authorized" });
        await post.deleteOne();
        io.emit("postDeleted", { postId });
        return res.status(200).json({ message: "Post deleted" });
    } catch (error) {
        return res.status(500).json({ message: `delete post error ${error}` });
    }
};

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
        io.emit("commentDeleted", { postId, commentId });
        return res.status(200).json({ message: "Comment deleted", commentId });
    } catch (error) {
        return res.status(500).json({ message: `delete comment error ${error}` });
    }
};

export const repost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.userId;
        const originalPost = await Post.findById(postId);
        if (!originalPost) return res.status(404).json({ message: "Original post not found" });
        const rootAuthor = originalPost.repostedFrom || originalPost.author;
        const newPost = await Post.create({
            author: userId,
            repostedFrom: rootAuthor,
            description: originalPost.description,
            image: originalPost.image || undefined
        });
        const populated = await Post.findById(newPost._id)
            .populate("author", "firstName lastName profileImage headline userName")
            .populate("repostedFrom", "firstName lastName profileImage headline userName")
            .populate("comment.user", "firstName lastName profileImage headline")
            .populate("reactions.user", "firstName lastName profileImage userName");
        io.emit("postCreated", populated);
        return res.status(201).json({ message: "Reposted successfully", post: populated });
    } catch (error) {
        return res.status(500).json({ message: `repost error ${error}` });
    }
};

export const quoteRepost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.userId;
        const { quote } = req.body;
        const originalPost = await Post.findById(postId);
        if (!originalPost) return res.status(404).json({ message: "Original post not found" });
        const rootAuthor = originalPost.repostedFrom || originalPost.author;
        const newPost = await Post.create({
            author: userId,
            repostedFrom: rootAuthor,
            description: originalPost.description,
            image: originalPost.image || undefined,
            quote: quote || ""
        });
        const populated = await Post.findById(newPost._id)
            .populate("author", "firstName lastName profileImage headline userName")
            .populate("repostedFrom", "firstName lastName profileImage headline userName")
            .populate("comment.user", "firstName lastName profileImage headline")
            .populate("reactions.user", "firstName lastName profileImage userName");
        io.emit("postCreated", populated);
        return res.status(201).json({ message: "Reposted with quote", post: populated });
    } catch (error) {
        return res.status(500).json({ message: `quote repost error ${error}` });
    }
};

export const toggleSavePost = async (req, res) => {
    try {
        const userId = req.userId;
        const postId = req.params.id;
        const user = await User.findById(userId).select("savedPosts");
        if (!user) return res.status(404).json({ message: "User not found" });

        const exists = (user.savedPosts || []).some(p => p.toString() === postId);
        if (exists) {
            user.savedPosts = user.savedPosts.filter(p => p.toString() !== postId);
        } else {
            user.savedPosts = [...(user.savedPosts || []), postId];
        }
        await user.save();
        return res.status(200).json({ saved: !exists, savedPosts: user.savedPosts });
    } catch (error) {
        return res.status(500).json({ message: `toggle save error ${error}` });
    }
};

export const getSavedPosts = async (req, res) => {
    try {
        const userId = req.userId;
        const user = await User.findById(userId).populate({
            path: "savedPosts",
            populate: [
                { path: "author", select: "firstName lastName profileImage headline userName" },
                { path: "repostedFrom", select: "firstName lastName profileImage headline userName" },
                { path: "comment.user", select: "firstName lastName profileImage headline" },
                { path: "reactions.user", select: "firstName lastName profileImage userName" }
            ]
        });
        if (!user) return res.status(404).json({ message: "User not found" });
        return res.status(200).json(user.savedPosts || []);
    } catch (error) {
        return res.status(500).json({ message: `get saved posts error ${error}` });
    }
};
