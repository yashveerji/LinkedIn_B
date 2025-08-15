import Connection from "../models/connection.model.js";
import User from "../models/user.model.js";
import { io, userSocketMap } from "../index.js";
import Notification from "../models/notification.model.js";

// Send connection request
export const sendConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const senderId = req.userId;

    if (senderId === id)
      return res.status(400).json({ message: "You cannot send request to yourself" });

    const sender = await User.findById(senderId);

    if (sender.connection.includes(id))
      return res.status(400).json({ message: "You are already connected" });

    const existingRequest = await Connection.findOne({
      sender: senderId,
      receiver: id,
      status: "pending",
    });
    if (existingRequest)
      return res.status(400).json({ message: "Request already exists" });

    const newRequest = await Connection.create({ sender: senderId, receiver: id });

    // Emit socket updates
    const receiverSocketId = userSocketMap.get(id);
    const senderSocketId = userSocketMap.get(senderId);

    if (receiverSocketId)
      io.to(receiverSocketId).emit("statusUpdate", { updatedUserId: senderId, newStatus: "received" });
    if (senderSocketId)
      io.to(senderSocketId).emit("statusUpdate", { updatedUserId: id, newStatus: "pending" });

    return res.status(200).json(newRequest);
  } catch (error) {
    return res.status(500).json({ message: `sendConnection error: ${error}` });
  }
};

// Accept connection request
export const acceptConnection = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const userId = req.userId;

    // Populate sender to get ObjectId
    const connection = await Connection.findById(connectionId).populate("sender");

    if (!connection) return res.status(400).json({ message: "Connection does not exist" });
    if (connection.status !== "pending") return res.status(400).json({ message: "Request under process" });

    connection.status = "accepted";
    await connection.save();

    // Create notification
    await Notification.create({
      receiver: connection.sender._id,
      type: "connectionAccepted",
      relatedUser: userId,
    });

    // Add to both users' connection arrays
    await User.findByIdAndUpdate(userId, { $addToSet: { connection: connection.sender._id } });
    await User.findByIdAndUpdate(connection.sender._id, { $addToSet: { connection: userId } });

    // Socket updates
    const receiverSocketId = userSocketMap.get(userId);
    const senderSocketId = userSocketMap.get(connection.sender._id.toString());

    if (receiverSocketId)
      io.to(receiverSocketId).emit("statusUpdate", { updatedUserId: connection.sender._id, newStatus: "disconnect" });
    if (senderSocketId)
      io.to(senderSocketId).emit("statusUpdate", { updatedUserId: userId, newStatus: "disconnect" });

    return res.status(200).json({ message: "Connection accepted" });
  } catch (error) {
    return res.status(500).json({ message: `acceptConnection error: ${error}` });
  }
};

// Reject connection request
export const rejectConnection = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = await Connection.findById(connectionId);

    if (!connection) return res.status(400).json({ message: "Connection does not exist" });
    if (connection.status !== "pending") return res.status(400).json({ message: "Request under process" });

    connection.status = "rejected";
    await connection.save();

    return res.status(200).json({ message: "Connection rejected" });
  } catch (error) {
    return res.status(500).json({ message: `rejectConnection error: ${error}` });
  }
};

// Get connection status between current user and another user
export const getConnectionStatus = async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.userId;

    const currentUser = await User.findById(currentUserId);

    if (currentUser.connection.includes(targetUserId)) {
      return res.json({ status: "disconnect" }); // already connected
    }

    const pendingRequest = await Connection.findOne({
      $or: [
        { sender: currentUserId, receiver: targetUserId },
        { sender: targetUserId, receiver: currentUserId },
      ],
      status: "pending",
    });

    if (pendingRequest) {
      if (pendingRequest.sender.toString() === currentUserId.toString()) {
        return res.json({ status: "pending" });
      } else {
        return res.json({ status: "received", requestId: pendingRequest._id });
      }
    }

    return res.json({ status: "Connect" });
  } catch (error) {
    return res.status(500).json({ message: `getConnectionStatus error: ${error}` });
  }
};

// Remove a connection
export const removeConnection = async (req, res) => {
  try {
    const myId = req.userId;
    const otherUserId = req.params.userId;

    await User.findByIdAndUpdate(myId, { $pull: { connection: otherUserId } });
    await User.findByIdAndUpdate(otherUserId, { $pull: { connection: myId } });

    const receiverSocketId = userSocketMap.get(otherUserId);
    const senderSocketId = userSocketMap.get(myId);

    if (receiverSocketId)
      io.to(receiverSocketId).emit("statusUpdate", { updatedUserId: myId, newStatus: "connect" });
    if (senderSocketId)
      io.to(senderSocketId).emit("statusUpdate", { updatedUserId: otherUserId, newStatus: "connect" });

    return res.json({ message: "Connection removed successfully" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: `removeConnection error: ${error}` });
  }
};

// Get all pending connection requests
export const getConnectionRequests = async (req, res) => {
  try {
    const userId = req.userId;

    const requests = await Connection.find({ receiver: userId, status: "pending" }).populate(
      "sender",
      "firstName lastName email userName profileImage headline"
    );

    return res.status(200).json(requests);
  } catch (error) {
    console.error(`getConnectionRequests error: ${error}`);
    return res.status(500).json({ message: "Server error" });
  }
};

// Get all accepted connections of current user
export const getUserConnections = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).populate(
      "connection",
      "firstName lastName userName profileImage headline"
    );

    return res.status(200).json(user.connection);
  } catch (error) {
    console.error(`getUserConnections error: ${error}`);
    return res.status(500).json({ message: "Server error" });
  }
};
