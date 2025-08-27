import express from "express"
import { login, logOut, signUp, verifyOtp, resendOtp, forgotPassword, resetPassword } from "../controllers/auth.controllers.js"

let authRouter=express.Router()

authRouter.post("/signup",signUp)
authRouter.post("/login",login)
authRouter.post("/verify-otp",verifyOtp)
authRouter.post("/resend-otp",resendOtp)
authRouter.post("/forgot-password",forgotPassword)
authRouter.post("/reset-password",resetPassword)
authRouter.get("/logout",logOut)

export default authRouter