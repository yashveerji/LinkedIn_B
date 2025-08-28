
import genToken from "../config/token.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import { sendOtpMail } from "../service/mail.service.js";

const isProd = (process.env.NODE_ENV === "production" || process.env.NODE_ENVIRONMENT === "production");

export const signUp = async (req, res) => {
  let createdUser = null;
  try {
    const { firstName, lastName, userName, email, password } = req.body;

    const existEmail = await User.findOne({ email });
    if (existEmail) return res.status(400).json({ message: "Email already exists!" });
    const existUsername = await User.findOne({ userName });
    if (existUsername) return res.status(400).json({ message: "Username already exists!" });
    if (!password || password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP for verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    createdUser = await User.create({
      firstName,
      lastName,
      userName,
      email,
      password: hashedPassword,
      otp,
      otpExpiry,
    });

    try {
      await sendOtpMail(email, otp);
    } catch (mailErr) {
      // ensure failed signups don't store email
      await User.findByIdAndDelete(createdUser._id);
      return res.status(500).json({ message: "Failed to send OTP email. Please try again." });
    }

    // Ask client to verify OTP; don't set login cookie yet
    return res.status(201).json({ message: "OTP sent to email. Please verify.", userId: createdUser._id });
  } catch (error) {
    if (createdUser?._id) {
      await User.findByIdAndDelete(createdUser._id);
    }
    console.log(error);
    return res.status(500).json({ message: "Signup error" });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) return res.status(400).json({ message: "Missing userId or otp" });

    const user = await User.findById(userId).select("+otp +otpExpiry");
    if (!user) return res.status(400).json({ message: "User not found" });
    if (!user.otp || !user.otpExpiry) return res.status(400).json({ message: "No OTP set for this user" });
    if (user.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
    if (user.otpExpiry < new Date()) return res.status(400).json({ message: "OTP expired" });

    // Clear OTP fields and log in user
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = await genToken(user._id);
  // Proactively clear any previous cookie variants (partitioned and non-partitioned)
  try { res.clearCookie("token", { path: "/", sameSite: isProd ? "none" : "lax", secure: isProd, partitioned: true }); } catch {}
  try { res.clearCookie("token", { path: "/", sameSite: isProd ? "none" : "lax", secure: isProd }); } catch {}
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: isProd ? "none" : "lax",
  secure: isProd,
      path: "/",
  // Allow cookie in third-party context but partitioned per top-level site (Chrome 3PC deprecation)
  partitioned: isProd,
    });
    return res.status(200).json(user);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "OTP verification error" });
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "Missing userId" });
    // Access otp fields
    const user = await User.findById(userId).select("email otp otpExpiry");
    if (!user) return res.status(400).json({ message: "User not found" });
    // If already verified, otp fields would be undefined
    if (user.otp === undefined || user.otpExpiry === undefined) {
      return res.status(400).json({ message: "User already verified" });
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    // Try sending email first; if sending fails, keep old OTP
    await sendOtpMail(user.email, newOtp);

    // Update stored OTP only after successful send
    user.otp = newOtp;
    user.otpExpiry = newExpiry;
    await user.save();

    return res.status(200).json({ message: "OTP resent" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Failed to resend OTP" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User does not exist!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    let token = await genToken(user._id);

  // Proactively clear any previous cookie variants (partitioned and non-partitioned)
  try { res.clearCookie("token", { path: "/", sameSite: isProd ? "none" : "lax", secure: isProd, partitioned: true }); } catch {}
  try { res.clearCookie("token", { path: "/", sameSite: isProd ? "none" : "lax", secure: isProd }); } catch {}
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      path: "/",
  partitioned: isProd
    });

    return res.status(200).json(user);

  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Login error" });
  }
};

export const logOut = async (req, res) => {
  try {
  // Clear both partitioned and non-partitioned variants
  res.clearCookie("token", {
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      path: "/",
  partitioned: isProd
    });
  try { res.clearCookie("token", { sameSite: isProd ? "none" : "lax", secure: isProd, path: "/" }); } catch {}
    return res.status(200).json({ message: "Log out successfully" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Logout error" });
  }
};

// Forgot Password: send OTP to email
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email }).select("email otp otpExpiry");
    if (!user) return res.status(200).json({ message: "If the email exists, an OTP has been sent." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await sendOtpMail(user.email, otp);

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    return res.status(200).json({ message: "OTP sent to email.", userId: user._id });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Failed to send reset OTP" });
  }
};

// Reset Password: verify OTP and set new password
export const resetPassword = async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;
    if (!userId || !otp || !newPassword) {
      return res.status(400).json({ message: "Missing userId, otp or newPassword" });
    }
    if (newPassword.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

    const user = await User.findById(userId).select("+otp +otpExpiry");
    if (!user) return res.status(400).json({ message: "User not found" });
    if (!user.otp || !user.otpExpiry) return res.status(400).json({ message: "No OTP set for this user" });
    if (user.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
    if (user.otpExpiry < new Date()) return res.status(400).json({ message: "OTP expired" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Password reset error" });
  }
};

