// controllers/chat.controller.js
import Message from "../models/Message.js";

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

    const [items, total] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Message.countDocuments(filter)
    ]);

    res.json({
      page, limit, total,
      items: items.reverse() // earliest first for UI
    });
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
