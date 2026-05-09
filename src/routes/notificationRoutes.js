import express from "express";
import supabase from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/* ------------------------------------------------------------------ */
/*  GET /api/notifications  — logged-in user's notifications           */
/* ------------------------------------------------------------------ */
router.get("/", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/notifications/read-all  — mark all as read              */
/* ------------------------------------------------------------------ */
router.patch("/read-all", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/notifications/:id/read  — mark single as read           */
/* ------------------------------------------------------------------ */
router.patch("/:id/read", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

export default router;
