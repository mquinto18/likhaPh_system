import express from "express";
import supabase from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Get all portfolio items for a specific creator (public)
router.get("/:creatorId", async (req, res) => {
  const { creatorId } = req.params;
  const { data, error } = await supabase
    .from("creator_portfolio")
    .select("*")
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: true });
  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

// Get all portfolio items for the current logged-in user
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { data, error } = await supabase
    .from("creator_portfolio")
    .select("*")
    .eq("creator_id", userId)
    .order("created_at", { ascending: true });
  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

// Add a new portfolio item
router.post("/", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { title, url, thumbnail, type } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ message: "Title is required" });
  }
  if (!url || !url.trim()) {
    return res.status(400).json({ message: "URL is required" });
  }

  const { data, error } = await supabase
    .from("creator_portfolio")
    .insert([
      {
        creator_id: userId,
        title: title.trim(),
        url: url.trim(),
        thumbnail: thumbnail || null,
        type: type || "link",
      },
    ])
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.status(201).json(data);
});

// Update a portfolio item
router.put("/:itemId", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { itemId } = req.params;
  const { title, url, thumbnail, type } = req.body;

  // Verify ownership
  const { data: existing } = await supabase
    .from("creator_portfolio")
    .select("creator_id")
    .eq("id", itemId)
    .single();

  if (!existing || existing.creator_id !== userId) {
    return res.status(403).json({ message: "Not authorized" });
  }

  const { data, error } = await supabase
    .from("creator_portfolio")
    .update({
      title: title?.trim(),
      url: url?.trim(),
      thumbnail: thumbnail || null,
      type: type || "link",
    })
    .eq("id", itemId)
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

// Delete a portfolio item
router.delete("/:itemId", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { itemId } = req.params;

  // Verify ownership
  const { data: existing } = await supabase
    .from("creator_portfolio")
    .select("creator_id")
    .eq("id", itemId)
    .single();

  if (!existing || existing.creator_id !== userId) {
    return res.status(403).json({ message: "Not authorized" });
  }

  const { error } = await supabase
    .from("creator_portfolio")
    .delete()
    .eq("id", itemId);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "Portfolio item deleted" });
});

export default router;
