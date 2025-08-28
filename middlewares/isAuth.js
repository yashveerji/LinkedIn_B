import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const isAuth = async (req, res, next) => {
  try {
    let token = undefined;
    // Prefer Authorization header if present
    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    // Fallback to cookie token
    if (!token) {
      token = req.cookies?.token;
    }

    if (!token) {
      return res.status(401).json({ message: "User doesn't have token" });
    }

    const verifyToken = jwt.verify(token, process.env.JWT_SECRET);

    if (!verifyToken) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.userId = verifyToken.userId;
    next();
  } catch (error) {
    console.log("isAuth error:", error);
    return res.status(500).json({ message: "Authentication error" });
  }
};

export default isAuth;
