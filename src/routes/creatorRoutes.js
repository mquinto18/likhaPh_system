// Get the current user's creator profile

import express from "express";
import supabase from "../config/supabase.js";
import nodemailer from "nodemailer";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post("/:creatorId/message", authMiddleware, async (req, res) => {
  const { creatorId } = req.params;
  const { message } = req.body;
  const senderUserId = req.user.id;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "Message is required" });
  }
  // Get the creator's email from auth.users via their user_id
  const { data: creator, error: creatorError } = await supabase
    .from("creators")
    .select("name, username, user_id")
    .eq("user_id", creatorId)
    .single();

  if (creatorError || !creator) {
    return res.status(404).json({ message: "Creator not found" });
  }

  // Get creator's email from Supabase Auth
  const { data: creatorAuth, error: authError } =
    await supabase.auth.admin.getUserById(creator.user_id);

  if (authError || !creatorAuth?.user?.email) {
    return res.status(400).json({ message: "Could not find creator email" });
  }

  // Get sender info
  const { data: sender } = await supabase
    .from("creators")
    .select("name, username")
    .eq("user_id", senderUserId)
    .single();

  const senderName = sender?.name || "A LikhaHub user";
  const senderUsername = sender?.username || "";

  // Get sender's email from Supabase Auth
  const { data: senderAuth } =
    await supabase.auth.admin.getUserById(senderUserId);
  const senderEmail = senderAuth?.user?.email || "";
  const senderProfileLink = senderUsername
    ? `${req.protocol}://${req.get("host").replace(":3001", ":8080")}/creator/${senderUsername}`
    : "";

  // Send email
  const mailOptions = {
    from: `"LikhaHub" <${process.env.EMAIL_USER}>`,
    to: creatorAuth.user.email,
    subject: `New Collaboration Request from ${senderName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2>Hey ${creator.name}! 👋</h2>
        <p><strong>${senderName}</strong> (${senderUsername}) wants to collaborate with you!</p>
        <div style="background: #f4f4f5; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
        ${senderEmail ? `<p style="font-size: 14px; margin: 12px 0;"><strong>Email:</strong> <a href="mailto:${senderEmail}" style="color: #6d28d9;">${senderEmail}</a></p>` : ""}
        ${senderProfileLink ? `<p style="font-size: 14px; margin: 12px 0;"><strong>Profile:</strong> <a href="${senderProfileLink}" style="color: #6d28d9;">View ${senderName}'s Profile</a></p>` : ""}
        <p style="color: #666; font-size: 14px;">Reply to this email or connect on LikhaHub.</p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">© 2026 LikhaHub</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: "Message sent successfully" });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

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
    account_status: "pending",
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
      account_status: "pending",
    },
  ]);
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  res.status(201).json({ message: "Creator created" });
});

// Public: get all onboarded and approved creators (no auth required)
router.get("/public", async (req, res) => {
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .eq("onboarding_complete", true)
    .eq("account_status", "approved");
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
    .eq("account_status", "approved")
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

// Admin: update a creator's account status (approve/reject)
router.patch("/:creatorId/status", authMiddleware, async (req, res) => {
  const { creatorId } = req.params;
  const { account_status } = req.body;

  if (!["approved", "rejected", "pending"].includes(account_status)) {
    return res.status(400).json({ message: "Invalid status. Use: approved, rejected, or pending" });
  }

  const { error } = await supabase
    .from("creators")
    .update({ account_status, updated_at: new Date().toISOString() })
    .eq("user_id", creatorId);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: `Creator status updated to ${account_status}` });
});

// Admin: get all pending creators
router.get("/admin/pending", authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .eq("onboarding_complete", true)
    .eq("account_status", "pending");
  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

export default router;
