const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const supabase = require("../supabase");
const { signToken, requireAuth } = require("../middleware/auth");

const router = express.Router();
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(8).max(72)
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(8).max(72)
});
function setSession(res, user) {
  res.cookie("support_session", signToken(user), {
    httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true",
    maxAge: 8 * 60 * 60 * 1000, path: "/"
  });
}
router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { name, email, password } = parsed.data;
    const password_hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase.from("profiles").insert({ name, email, password_hash, role: "customer" })
      .select("id, name, email, role, created_at").single();
    if (error?.code === "23505") return res.status(409).json({ error: "An account with this email already exists." });
    if (error) return next(error);
    setSession(res, data);
    res.status(201).json({ user: data });
  } catch (error) { next(error); }
});
router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
    const { data: user, error } = await supabase.from("profiles")
      .select("id, name, email, role, password_hash, created_at").eq("email", parsed.data.email).maybeSingle();
    if (error) return next(error);
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    setSession(res, user);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (error) { next(error); }
});
router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
router.post("/logout", (req, res) => {
  res.clearCookie("support_session", { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/" });
  res.json({ message: "Signed out." });
});
module.exports = router;
