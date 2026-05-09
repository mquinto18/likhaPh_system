import express from "express";
import supabase from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

const REAPPLY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

async function notifyBrandNewApplication(creatorUserId, campaign, applicationId) {
  const { data: creator } = await supabase
    .from("creators")
    .select("name")
    .eq("user_id", creatorUserId)
    .single();

  const creatorName = creator?.name || "A creator";

  await supabase.from("notifications").insert([{
    user_id: campaign.brand_id,
    type: "new_application",
    title: "New application received",
    body: `${creatorName} applied to your campaign "${campaign.title}"`,
    data: { campaign_id: campaign.id, application_id: applicationId },
  }]);
}

/* ------------------------------------------------------------------ */
/*  POST /api/applications  — creator submits an application          */
/* ------------------------------------------------------------------ */
router.post("/", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  const { campaign_id, pitch, proposed_rate } = req.body;
  if (!campaign_id) return res.status(400).json({ message: "campaign_id is required" });

  // Verify campaign exists and is published
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, title, status, brand_id")
    .eq("id", campaign_id)
    .single();

  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  if (campaign.status !== "published") return res.status(400).json({ message: "Campaign is not accepting applications" });
  if (campaign.brand_id === user.id) return res.status(400).json({ message: "Brands cannot apply to their own campaigns" });

  // Check for any existing application (active or withdrawn) for this campaign/creator
  const { data: existing } = await supabase
    .from("applications")
    .select("id, status, updated_at")
    .eq("campaign_id", campaign_id)
    .eq("creator_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.status !== "withdrawn") {
      return res.status(409).json({ message: "You have already applied to this campaign" });
    }

    // Withdrawn — enforce 30-minute cooldown
    const withdrawnAt = new Date(existing.updated_at);
    const reapplyAfter = new Date(withdrawnAt.getTime() + REAPPLY_COOLDOWN_MS);
    if (Date.now() < reapplyAfter.getTime()) {
      return res.status(429).json({
        message: "You must wait 30 minutes before reapplying to this campaign.",
        withdrawn_at: existing.updated_at,
        reapply_after: reapplyAfter.toISOString(),
      });
    }

    // Cooldown passed — reactivate by updating the existing record
    const { data, error } = await supabase
      .from("applications")
      .update({
        status: "pending",
        pitch: pitch || null,
        proposed_rate: proposed_rate ? Number(proposed_rate) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return res.status(400).json({ message: error.message });

    await notifyBrandNewApplication(user.id, campaign, existing.id);
    return res.status(201).json(data);
  }

  // No prior application — insert fresh
  const { data, error } = await supabase
    .from("applications")
    .insert([{
      campaign_id,
      creator_id: user.id,
      pitch: pitch || null,
      proposed_rate: proposed_rate ? Number(proposed_rate) : null,
    }])
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return res.status(409).json({ message: "You have already applied to this campaign" });
    return res.status(400).json({ message: error.message });
  }

  await notifyBrandNewApplication(user.id, campaign, data.id);
  res.status(201).json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/applications/my  — creator views their own applications  */
/* ------------------------------------------------------------------ */
router.get("/my", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  const { data, error } = await supabase
    .from("applications")
    .select(`
      *,
      campaign:campaigns(
        id, title, description, cover_image, status, industry, created_at,
        platforms, content_types, creator_niches, follower_tiers,
        compensation_type, budget_min, budget_max, open_to_negotiation,
        creators_needed, goal, visibility, deliverables,
        key_message, dos, donts, application_question, reference_links,
        application_deadline, submission_deadline, posting_date,
        brand:creators!campaigns_brand_id_fkey(name, username, avatar_url)
      )
    `)
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/applications/campaign/:campaignId  — brand views         */
/*  all applications for one of their campaigns                       */
/* ------------------------------------------------------------------ */
router.get("/campaign/:campaignId", authMiddleware, async (req, res) => {
  const user = req.user;
  const { campaignId } = req.params;

  // Verify the campaign belongs to this brand
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("brand_id")
    .eq("id", campaignId)
    .single();

  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  if (campaign.brand_id !== user.id) return res.status(403).json({ message: "Forbidden" });

  const { data, error } = await supabase
    .from("applications")
    .select(`
      *,
      creator:creators!applications_creator_id_fkey(
        user_id, name, username, bio, avatar_url, niche,
        socials, followers, rate
      )
    `)
    .eq("campaign_id", campaignId)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/applications/:id/status  — update status               */
/*  Brands: approved | rejected                                        */
/*  Creators: withdrawn                                                */
/* ------------------------------------------------------------------ */
router.patch("/:id/status", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const { status } = req.body;

  if (!["approved", "rejected", "withdrawn"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  // Fetch the application with its campaign
  const { data: application } = await supabase
    .from("applications")
    .select("*, campaign:campaigns(id, title, brand_id, creators_needed)")
    .eq("id", id)
    .single();

  if (!application) return res.status(404).json({ message: "Application not found" });

  const isBrand = application.campaign.brand_id === user.id;
  const isCreator = application.creator_id === user.id;

  // Brands can approve or reject; creators can only withdraw
  if (status === "withdrawn" && !isCreator) return res.status(403).json({ message: "Only the creator can withdraw" });
  if ((status === "approved" || status === "rejected") && !isBrand) return res.status(403).json({ message: "Only the brand can approve or reject" });

  const previousStatus = application.status;

  const { data, error } = await supabase
    .from("applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });

  // Notify the creator when a brand approves or rejects their application
  if (status === "approved" || status === "rejected") {
    const { data: brand } = await supabase
      .from("creators")
      .select("name")
      .eq("user_id", user.id)
      .single();

    const brandName = brand?.name || "A brand";
    const campaignTitle = application.campaign.title || "a campaign";

    await supabase.from("notifications").insert([{
      user_id: application.creator_id,
      type: status === "approved" ? "application_approved" : "application_rejected",
      title: status === "approved"
        ? "Application approved! 🎉"
        : "Application not selected",
      body: status === "approved"
        ? `${brandName} approved your application for "${campaignTitle}". They'll be in touch soon.`
        : `${brandName} didn't move forward with your application for "${campaignTitle}". Keep applying!`,
      data: { campaign_id: application.campaign_id, application_id: id },
    }]);
  }

  // Sync creators_needed based on status transition
  const wasApproved = previousStatus === "approved";
  const nowApproved = status === "approved";

  if (!wasApproved && nowApproved) {
    // New approval — decrement
    const { error: err } = await supabase.rpc("decrement_creators_needed", {
      campaign_id: application.campaign.id,
    });
    if (err) console.error("[approve] decrement failed:", err.message);
  } else if (wasApproved && !nowApproved) {
    // Revoking an approval (reject or withdraw from approved) — increment back
    const { error: err } = await supabase.rpc("increment_creators_needed", {
      campaign_id: application.campaign.id,
    });
    if (err) console.error("[revoke] increment failed:", err.message);
  }

  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/applications/:id  — creator removes rejected/ended    */
/* ------------------------------------------------------------------ */
router.delete("/:id", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const { data: application } = await supabase
    .from("applications")
    .select("*, campaign:campaigns(id, application_deadline)")
    .eq("id", id)
    .single();

  if (!application) return res.status(404).json({ message: "Application not found" });
  if (application.creator_id !== user.id) return res.status(403).json({ message: "Forbidden" });

  const campaignEnded =
    application.campaign?.application_deadline &&
    new Date(application.campaign.application_deadline) < new Date();

  const canDelete = ["rejected", "withdrawn"].includes(application.status) || campaignEnded;
  if (!canDelete) return res.status(400).json({ message: "Only rejected, withdrawn, or ended applications can be removed" });

  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ success: true });
});

export default router;
