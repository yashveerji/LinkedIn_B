import uploadOnCloudinary from "../config/cloudinary.js";
import User from "../models/user.model.js";

// ✅ Get the currently logged-in user
export const getCurrentUser = async (req, res) => {
  try {
    const id = req.userId; // Comes from isAuth middleware
    // Populate connections with basic info
    const user = await User.findById(id)
      .select("-password")
      .populate({
        path: 'connection',
        select: 'firstName lastName userName profileImage headline',
      });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // For frontend compatibility, return as 'connections' array
    const userObj = user.toObject();
    userObj.connections = userObj.connection || [];
    delete userObj.connection;

    return res.status(200).json(userObj);
  } catch (error) {
    console.error("getCurrentUser error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Update profile details (FIXED for arrays)
export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, userName, headline, location, gender } = req.body;

    // Always parse array fields from FormData
    const parseArrayField = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try {
        return JSON.parse(val);
      } catch {
        return [];
      }
    };

    const skills = parseArrayField(req.body.skills);
    const education = parseArrayField(req.body.education);
    const experience = parseArrayField(req.body.experience);

    let profileImage;
    let coverImage;

    // Handle file uploads
    if (req.files?.profileImage) {
      profileImage = await uploadOnCloudinary(req.files.profileImage[0].path);
    }
    if (req.files?.coverImage) {
      coverImage = await uploadOnCloudinary(req.files.coverImage[0].path);
    }

    // Build update object
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (userName !== undefined) updateData.userName = userName;
    if (headline !== undefined) updateData.headline = headline;
    if (location !== undefined) updateData.location = location;
    if (gender !== undefined) updateData.gender = gender;

    // Arrays are always updated, even if empty
    updateData.skills = skills;
    updateData.education = education;
    updateData.experience = experience;

    if (profileImage) updateData.profileImage = profileImage;
    if (coverImage) updateData.coverImage = coverImage;

    const user = await User.findByIdAndUpdate(req.userId, updateData, {
      new: true,
    }).select("-password");

    return res.status(200).json(user);
  } catch (error) {
    console.error("updateProfile error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get profile by username
export const getprofile = async (req, res) => {
  try {
    const { userName } = req.params;
    const user = await User.findOne({ userName }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Username does not exist" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error("getprofile error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Search users
export const search = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Query is required" });
    }

    const users = await User.find({
      $or: [
        { firstName: { $regex: query, $options: "i" } },
        { lastName: { $regex: query, $options: "i" } },
        { userName: { $regex: query, $options: "i" } },
        { skills: { $in: [query] } },
      ],
    }).select("-password");

    return res.status(200).json(users);
  } catch (error) {
    console.error("search error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get suggested users
export const getSuggestedUser = async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId).select("connection");

    if (!currentUser) {
      return res.status(404).json({ message: "Current user not found" });
    }

    const suggestedUsers = await User.find({
      _id: { $ne: currentUser._id, $nin: currentUser.connection },
    }).select("-password");

    return res.status(200).json(suggestedUsers);
  } catch (error) {
    console.error("getSuggestedUser error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Get last seen for a user by id
export const getLastSeen = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "User id required" });
    const user = await User.findById(id).select("lastSeen");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ lastSeen: user.lastSeen || null });
  } catch (error) {
    console.error("getLastSeen error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
