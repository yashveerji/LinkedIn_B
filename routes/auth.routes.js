import express from "express"
import { login, logOut, signUp } from "../controllers/auth.controllers.js"
import { verifyOtp } from "../controllers/auth.controllers.js"

let authRouter=express.Router()

authRouter.post("/signup",signUp)
authRouter.post("/login",login)
authRouter.get("/logout",logOut)
authRouter.post("/verify-otp",verifyOtp)

export default authRouter