
import genToken from "../config/token.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import { sendOtpMail } from "../service/mail.service.js";

export const signUp = async (req, res) => {
  try {
    const { firstName, lastName, userName, email, password } = req.body;

    let existEmail = await User.findOne({ email });
    if (existEmail) {
      return res.status(400).json({ message: "Email already exists!" });
    }

    let existUsername = await User.findOne({ userName });
    if (existUsername) {
      return res.status(400).json({ message: "Username already exists!" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    let hashedPassword = await bcrypt.hash(password, 10);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await User.create({
      firstName,
      lastName,
      userName,
      email,
      password: hashedPassword,
      otp,
      otpExpiry
    });

    // Send OTP email
    await sendOtpMail(email, otp);

    // Do not log in user yet, require OTP verification
    return res.status(201).json({ message: "OTP sent to email. Please verify.", userId: user._id });

  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Signup error" });
  }
};
// OTP verification endpoint
export const verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: "User not found" });
    if (!user.otp || !user.otpExpiry) return res.status(400).json({ message: "No OTP set for this user" });
    if (user.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
    if (user.otpExpiry < new Date()) return res.status(400).json({ message: "OTP expired" });

    // OTP valid, clear OTP fields and log in user
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    let token = await genToken(user._id);
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return res.status(200).json(user);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "OTP verification error" });
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

    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production"
    });

    return res.status(200).json(user);

  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Login error" });
  }
};

export const logOut = async (req, res) => {
  try {
    res.clearCookie("token", {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return res.status(200).json({ message: "Log out successfully" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Logout error" });
  }
};
