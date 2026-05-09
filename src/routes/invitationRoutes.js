import express from "express";
import supabase from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/* ------------------------------------------------------------------ */
/*  POST /api/invitations  — brand invites a creator to a campaign     */
/* ------------------------------------------------------------------ */
router.post("/", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  const { campaign_id, creator_id } = req.body;
  if (!campaign_id || !creator_id)
    return res.status(400).json({ message: "campaign_id and creator_id are required" });

  // Verify brand owns the campaign
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, brand_id, title, status")
    .eq("id", campaign_id)
    .single();

  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  if (campaign.brand_id !== user.id) return res.status(403).json({ message: "Forbidden" });
  if (campaign.status !== "published")
    return res.status(400).json({ message: "Only published campaigns can receive invitations" });

  // Prevent inviting yourself
  if (creator_id === user.id)
    return res.status(400).json({ message: "You cannot invite yourself" });

  // Check for existing invite that is still pending or accepted
  const { data: existing } = await supabase
    .from("invitations")
    .select("id, status")
    .eq("campaign_id", campaign_id)
    .eq("creator_id", creator_id)
    .maybeSingle();

  if (existing && existing.status !== "declined") {
    return res.status(409).json({ message: "Creator has already been invited to this campaign" });
  }

  // Fetch brand name for notification body
  const { data: brand } = await supabase
    .from("creators")
    .select("name")
    .eq("user_id", user.id)
    .single();

  const brandName = brand?.name || "A brand";

  if (existing && existing.status === "declined") {
    // Re-send by updating existing record
    const { data, error } = await supabase
      .from("invitations")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });

    await supabase.from("notifications").insert([{
      user_id: creator_id,
      type: "invitation",
      title: "You've been invited to a campaign",
      body: `${brandName} invited you to join "${campaign.title}"`,
      data: { campaign_id, invitation_id: existing.id },
    }]);

    return res.status(201).json(data);
  }

  const { data, error } = await supabase
    .from("invitations")
    .insert([{ campaign_id, creator_id, brand_id: user.id }])
    .select()
    .single();

  if (error) {
    if (error.code === "23505")
      return res.status(409).json({ message: "Creator has already been invited" });
    return res.status(400).json({ message: error.message });
  }

  await supabase.from("notifications").insert([{
    user_id: creator_id,
    type: "invitation",
    title: "You've been invited to a campaign",
    body: `${brandName} invited you to join "${campaign.title}"`,
    data: { campaign_id, invitation_id: data.id },
  }]);

  res.status(201).json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/invitations/campaign/:campaignId  — brand views invites   */
/* ------------------------------------------------------------------ */
router.get("/campaign/:campaignId", authMiddleware, async (req, res) => {
  const user = req.user;
  const { campaignId } = req.params;

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("brand_id")
    .eq("id", campaignId)
    .single();

  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  if (campaign.brand_id !== user.id) return res.status(403).json({ message: "Forbidden" });

  const { data, error } = await supabase
    .from("invitations")
    .select(`
      *,
      creator:creators!invitations_creator_id_fkey(
        user_id, name, username, avatar_url, niche, followers, rate
      )
    `)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/invitations/my  — creator views invites sent to them      */
/* ------------------------------------------------------------------ */
router.get("/my", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  const { data, error } = await supabase
    .from("invitations")
    .select(`
      *,
      campaign:campaigns(
        id, title, description, cover_image, status, industry,
        platforms, content_types, compensation_type, budget_min, budget_max,
        open_to_negotiation, creators_needed, goal, application_deadline,
        brand:creators!campaigns_brand_id_fkey(name, username, avatar_url)
      )
    `)
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/invitations/:id/status  — creator accepts or declines   */
/* ------------------------------------------------------------------ */
router.patch("/:id/status", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const { status } = req.body;

  if (!["accepted", "declined"].includes(status)) {
    return res.status(400).json({ message: "Status must be accepted or declined" });
  }

  const { data: invitation } = await supabase
    .from("invitations")
    .select("*, campaign:campaigns(id, title, brand_id, status)")
    .eq("id", id)
    .single();

  if (!invitation) return res.status(404).json({ message: "Invitation not found" });
  if (invitation.creator_id !== user.id) return res.status(403).json({ message: "Forbidden" });
  if (invitation.status !== "pending") {
    return res.status(400).json({ message: "Invitation has already been responded to" });
  }

  const { data, error } = await supabase
    .from("invitations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });

  // Notify the brand of the creator's response
  const { data: creator } = await supabase
    .from("creators")
    .select("name")
    .eq("user_id", user.id)
    .single();

  const creatorName = creator?.name || "A creator";
  const campaignTitle = invitation.campaign.title || "your campaign";

  await supabase.from("notifications").insert([{
    user_id: invitation.campaign.brand_id,
    type: status === "accepted" ? "invite_accepted" : "invite_declined",
    title: status === "accepted"
      ? `${creatorName} accepted your invitation`
      : `${creatorName} declined your invitation`,
    body: status === "accepted"
      ? `${creatorName} accepted your invite to "${campaignTitle}" and is now in your applicant list.`
      : `${creatorName} declined your invite to "${campaignTitle}".`,
    data: { campaign_id: invitation.campaign_id, invitation_id: id },
  }]);

  // On accept — auto-create a pending application so brand sees them in applicant list
  if (status === "accepted") {
    const { error: appError } = await supabase
      .from("applications")
      .insert([{
        campaign_id: invitation.campaign_id,
        creator_id: user.id,
        pitch: null,
        proposed_rate: null,
        status: "pending",
      }])
      .select()
      .single();

    // Ignore duplicate (creator may have already applied)
    if (appError && appError.code !== "23505") {
      console.error("[invite accept] application insert failed:", appError.message);
    }
  }

  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/invitations/:id  — creator removes a declined invite   */
/* ------------------------------------------------------------------ */
router.delete("/:id", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const { data: invitation } = await supabase
    .from("invitations")
    .select("id, creator_id, status")
    .eq("id", id)
    .single();

  if (!invitation) return res.status(404).json({ message: "Invitation not found" });
  if (invitation.creator_id !== user.id) return res.status(403).json({ message: "Forbidden" });
  if (invitation.status !== "declined") return res.status(400).json({ message: "Only declined invitations can be removed" });

  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", id);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ success: true });
});

export default router;
