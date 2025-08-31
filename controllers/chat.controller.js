/**
 * POST /api/chat/share-post
 * Body: { to: userId, postId }
 * Sends a message with a post reference to a connection
 */
import Post from "../models/post.model.js";
export const sharePost = async (req, res) => {
  try {
    const from = req.user?._id || req.userId;
    const { to, postId } = req.body;
    if (!to || !postId) return res.status(400).json({ message: "Missing recipient or postId" });
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    // Compose a message with a post reference (could be a special text or a type field)
    const text = `Shared a post with you: ${post.description?.slice(0, 100) || "[No description]"}`;
    const message = await Message.create({ from, to, text, post: postId });
    // Optionally emit via socket.io here
    res.status(201).json({ message: "Post shared in chat", chatMessage: message });
  } catch (err) {
    console.error("sharePost error:", err);
    res.status(500).json({ message: "Failed to share post in chat" });
  }
};
// controllers/chat.controller.js
import Message from "../models/Message.js";
import CallLog from "../models/CallLog.js";

/**
 * GET /api/chat/history/:withUser?page=1&limit=30
 * Returns paginated DM history (both directions) with a specific user
 */
export const getHistory = async (req, res) => {
  try {
    const userId = req.user?._id || req.userId; // adapt to your auth
    const withUser = req.params.withUser;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
    const skip = (page - 1) * limit;

    const filter = {
      $or: [
        { from: userId, to: withUser },
        { from: withUser, to: userId }
      ]
    };

    // Fetch messages and recent call logs within the same conversation
    const [msgs, calls, totalMsgs, totalCalls] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      CallLog.find({ $or: [ { from: userId, to: withUser }, { from: withUser, to: userId } ] }).sort({ createdAt: -1 }).limit(200),
      Message.countDocuments(filter),
      CallLog.countDocuments({ $or: [ { from: userId, to: withUser }, { from: withUser, to: userId } ] })
    ]);

    // Tag and merge
    const taggedMsgs = msgs.map(m => ({
      _id: m._id,
      type: 'message',
      from: m.from,
      to: m.to,
      text: m.text,
      attachmentUrl: m.attachmentUrl,
      attachmentType: m.attachmentType,
      attachmentName: m.attachmentName,
      attachmentMime: m.attachmentMime,
      attachmentSize: m.attachmentSize,
      attachmentWidth: m.attachmentWidth,
      attachmentHeight: m.attachmentHeight,
      deliveredAt: m.deliveredAt,
      readAt: m.readAt,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    }));
    const taggedCalls = calls.map(c => ({
      _id: c._id,
      type: 'call',
      from: c.from,
      to: c.to,
      callType: c.callType,
      status: c.status,
      startedAt: c.startedAt,
      answeredAt: c.answeredAt,
      endedAt: c.endedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));

    const merged = [...taggedMsgs, ...taggedCalls].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    // For pagination, keep total as messages+calls (approximate). Clients can fetch more if needed.
    const total = totalMsgs + totalCalls;

    res.json({ page, limit, total, items: merged });
  } catch (err) {
    console.error("getHistory error:", err);
    res.status(500).json({ message: "Failed to fetch chat history" });
  }
};

/**
 * GET /api/chat/inbox
 * Returns latest message per conversation partner for current user
 */
export const getInbox = async (req, res) => {
  try {
    const userId = req.user?._id || req.userId;

    const pipeline = [
      {
        $match: {
          $or: [
            { from: new Message().constructor.Types.ObjectId(userId) },
            { to:   new Message().constructor.Types.ObjectId(userId) }
          ]
        }
      },
      {
        $addFields: {
          otherUser: {
            $cond: [{ $eq: ["$from", new Message().constructor.Types.ObjectId(userId)] }, "$to", "$from"]
          }
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$otherUser",
          lastMessage: { $first: "$$ROOT" },
          unread: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$to", new Message().constructor.Types.ObjectId(userId)] }, { $eq: ["$readAt", null] }] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { "lastMessage.createdAt": -1 } }
    ];

    const rows = await Message.aggregate(pipeline);
    res.json(rows);
  } catch (err) {
    console.error("getInbox error:", err);
    res.status(500).json({ message: "Failed to fetch inbox" });
  }
};

/**
 * PATCH /api/chat/read/:withUser
 * Marks messages from :withUser to me as read
 */
export const markRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.userId;
    const withUser = req.params.withUser;

    const result = await Message.updateMany(
      { from: withUser, to: userId, readAt: null },
      { $set: { readAt: new Date() } }
    );

    res.json({ updated: result.modifiedCount });
  } catch (err) {
    console.error("markRead error:", err);
    res.status(500).json({ message: "Failed to mark as read" });
  }
};
