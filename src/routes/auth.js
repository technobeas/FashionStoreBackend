import { Router } from "express";
import { login, register, logout, me } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
const r = Router();
r.post("/register", register);
r.post("/login", login);
r.post("/logout", logout);
r.get("/me", requireAuth, me);
export default r;
