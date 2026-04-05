import express from "express";
import supabase from "../config/supabase.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  // 1. Sign in with Supabase Auth
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  const user = data.user;
  const session = data.session;
  if (!user || !user.id) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  // 2. Get onboarding status and role from creators table
  const { data: creator, error: creatorError } = await supabase
    .from("creators")
    .select("onboarding_complete, role")
    .eq("user_id", user.id)
    .single();
  if (creatorError) {
    return res.status(400).json({ message: creatorError.message });
  }
  // 3. Validate role if provided
  if (role && creator?.role && creator.role !== role) {
    return res.status(403).json({
      message: `This account is registered as a ${creator.role}. Please select "${creator.role.charAt(0).toUpperCase() + creator.role.slice(1)}" to sign in.`,
    });
  }
  res.status(200).json({
    user,
    access_token: session?.access_token || null,
    refresh_token: session?.refresh_token || null,
    onboarding_complete: creator?.onboarding_complete || false,
    role: creator?.role || "creator",
  });
});
// Sign up endpoint
router.post("/signup", async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  // 1. Create user in Supabase Auth
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  const user = data.user;
  const session = data.session;
  if (!user || !user.id) {
    return res.status(500).json({ message: "User creation failed" });
  }
  // 2. Insert into creators table (use email as username, name left blank)
  const { error: creatorError } = await supabase.from("creators").insert([
    {
      user_id: user.id,
      name: "",
      username: email,
      role: role || "creator",
    },
  ]);
  if (creatorError) {
    return res.status(400).json({ message: creatorError.message });
  }
  // 3. Return JWT access token and refresh token if available
  res.status(201).json({
    user,
    access_token: session?.access_token || null,
    refresh_token: session?.refresh_token || null,
  });
});

export default router;
