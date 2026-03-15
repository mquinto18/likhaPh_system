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

// Public: get a single creator by username (no auth required)
router.get("/public/:username", async (req, res) => {
  const { username } = req.params;
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .eq("username", username)
    .eq("onboarding_complete", true)
    .single();
  if (error || !data)
    return res.status(404).json({ message: "Creator not found" });
  res.json(data);
});

router.get("/", authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from("creators").select("*");
  if (error) return res.status(400).json(error);
  res.json(data);
});

// Toggle like on a creator (like if not liked, unlike if already liked)
router.post("/:creatorId/like", authMiddleware, async (req, res) => {
  const user = req.user;
  const { creatorId } = req.params;
  if (!user || !user.id) {
    return res.status(400).json({ message: "User info missing" });
  }
  // Check if already liked
  const { data: existing } = await supabase
    .from("creator_likes")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    // Unlike
    await supabase
      .from("creator_likes")
      .delete()
      .eq("creator_id", creatorId)
      .eq("user_id", user.id);
  } else {
    // Like
    const { error } = await supabase
      .from("creator_likes")
      .insert([{ creator_id: creatorId, user_id: user.id }]);
    if (error) return res.status(400).json({ message: error.message });
  }

  // Return updated count and liked status
  const { count } = await supabase
    .from("creator_likes")
    .select("*", { count: "exact", head: true })
    .eq("creator_id", creatorId);
  res.json({ liked: !existing, likes_count: count || 0 });
});

// Get likes count and whether current user liked (public count, auth for liked status)
router.get("/:creatorId/likes", async (req, res) => {
  const { creatorId } = req.params;
  const { count } = await supabase
    .from("creator_likes")
    .select("*", { count: "exact", head: true })
    .eq("creator_id", creatorId);

  // Check auth header for liked status
  const authHeader = req.headers.authorization;
  let liked = false;
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (user) {
      const { data: existing } = await supabase
        .from("creator_likes")
        .select("id")
        .eq("creator_id", creatorId)
        .eq("user_id", user.id)
        .single();
      liked = !!existing;
    }
  }
  res.json({ likes_count: count || 0, liked });
});

export default router;
