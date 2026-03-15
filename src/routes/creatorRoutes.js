// Get the current user's creator profile

import express from "express";
import supabase from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.get("/me", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user || !user.id) {
    return res.status(400).json({ message: "User info missing" });
  }
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});
router.put("/", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user || !user.id) {
    return res.status(400).json({ message: "User info missing" });
  }
  // Check for duplicate username (excluding current user)
  if (req.body.username) {
    const { data: existing } = await supabase
      .from("creators")
      .select("user_id")
      .eq("username", req.body.username)
      .neq("user_id", user.id)
      .single();
    if (existing) {
      return res.status(409).json({ message: "Username is already taken" });
    }
  }
  const updateFields = {
    ...req.body,
    onboarding_complete: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("creators")
    .update(updateFields)
    .eq("user_id", user.id);
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  res.status(200).json({ message: "Profile updated and onboarding complete" });
});
// Create a new creator (for OAuth users)
router.post("/", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user || !user.id || !user.email) {
    return res.status(400).json({ message: "User info missing" });
  }
  // Check if already exists
  const { data: existing } = await supabase
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (existing) {
    return res.status(200).json({ message: "Creator already exists" });
  }
  // Insert new creator
  const { error } = await supabase.from("creators").insert([
    {
      user_id: user.id,
      name: "",
      username: user.email,
    },
  ]);
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  res.status(201).json({ message: "Creator created" });
});

// Public: get all onboarded creators (no auth required)
router.get("/public", async (req, res) => {
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .eq("onboarding_complete", true);
  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

router.get("/", authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from("creators").select("*");
  if (error) return res.status(400).json(error);
  res.json(data);
});

export default router;
