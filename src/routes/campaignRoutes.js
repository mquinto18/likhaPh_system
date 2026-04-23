import express from "express";
import supabase from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/* ------------------------------------------------------------------ */
/*  Helper — fetch the brand's creator record and assert role         */
/* ------------------------------------------------------------------ */
async function getBrand(userId) {
  const { data, error } = await supabase
    .from("creators")
    .select("user_id, name, username, role")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  if (data.role !== "brand") return null;
  return data;
}

/* ------------------------------------------------------------------ */
/*  POST /api/campaigns  — create a campaign (brands only)            */
/* ------------------------------------------------------------------ */
router.post("/", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  const brand = await getBrand(user.id);
  if (!brand) {
    return res.status(403).json({ message: "Only brand accounts can create campaigns" });
  }

  const {
    title,
    description,
    goal,
    industry,
    platforms,
    contentTypes,
    deliverables,
    keyMessage,
    dos,
    donts,
    referenceLinks,
    creatorNiches,
    followerTiers,
    minEngagement,
    audienceLocations,
    audienceAgeRanges,
    preferredGender,
    contentLanguage,
    compensationType,
    budgetMin,
    budgetMax,
    openToNegotiation,
    giftingDetails,
    usageRights,
    exclusivityPeriod,
    applicationDeadline,
    submissionDeadline,
    postingDate,
    revisionRounds,
    creatorsNeeded,
    visibility,
    applicationQuestion,
    coverImage,
    status,
  } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({ message: "Campaign title is required" });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert([
      {
        brand_id: user.id,
        title: title.trim(),
        description: description || null,
        goal: goal || null,
        industry: industry || null,
        platforms: platforms || [],
        content_types: contentTypes || [],
        deliverables: deliverables !== "" ? Number(deliverables) : null,
        key_message: keyMessage || null,
        dos: dos || null,
        donts: donts || null,
        reference_links: (referenceLinks || []).filter(Boolean),
        creator_niches: creatorNiches || [],
        follower_tiers: followerTiers || [],
        min_engagement: minEngagement || null,
        audience_locations: audienceLocations || [],
        audience_age_ranges: audienceAgeRanges || [],
        preferred_gender: preferredGender || null,
        content_language: contentLanguage || null,
        compensation_type: compensationType || null,
        budget_min: budgetMin ? Number(budgetMin) : null,
        budget_max: budgetMax ? Number(budgetMax) : null,
        open_to_negotiation: openToNegotiation ?? false,
        gifting_details: giftingDetails || null,
        usage_rights: usageRights || null,
        exclusivity_period: exclusivityPeriod || null,
        application_deadline: applicationDeadline || null,
        submission_deadline: submissionDeadline || null,
        posting_date: postingDate || null,
        revision_rounds: revisionRounds ?? 2,
        creators_needed: creatorsNeeded !== "" ? Number(creatorsNeeded) : null,
        visibility: visibility || "public",
        application_question: applicationQuestion || null,
        cover_image: coverImage || null,
        status: status || "published",
      },
    ])
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.status(201).json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/campaigns/my  — campaigns belonging to the logged-in brand*/
/* ------------------------------------------------------------------ */
router.get("/my", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  const brand = await getBrand(user.id);
  if (!brand) {
    return res.status(403).json({ message: "Only brand accounts can view their campaigns" });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select(`
      *,
      brand:creators!campaigns_brand_id_fkey(name, username)
    `)
    .eq("brand_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/campaigns  — all public/published campaigns              */
/* ------------------------------------------------------------------ */
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("campaigns")
    .select(`
      *,
      brand:creators!campaigns_brand_id_fkey(name, username)
    `)
    .eq("visibility", "public")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/campaigns/:id  — single campaign                         */
/* ------------------------------------------------------------------ */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("campaigns")
    .select(`
      *,
      brand:creators!campaigns_brand_id_fkey(name, username)
    `)
    .eq("id", id)
    .single();

  if (error || !data)
    return res.status(404).json({ message: "Campaign not found" });

  // Gate private/draft campaigns to the owning brand only
  if (data.visibility === "private" || data.status === "draft") {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(403).json({ message: "Forbidden" });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user || user.id !== data.brand_id) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }

  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  PUT /api/campaigns/:id  — update a campaign (owning brand only)   */
/* ------------------------------------------------------------------ */
router.put("/:id", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const brand = await getBrand(user.id);
  if (!brand) {
    return res.status(403).json({ message: "Only brand accounts can edit campaigns" });
  }

  const { data: existing } = await supabase
    .from("campaigns")
    .select("brand_id")
    .eq("id", id)
    .single();

  if (!existing) return res.status(404).json({ message: "Campaign not found" });
  if (existing.brand_id !== user.id) return res.status(403).json({ message: "Forbidden" });

  const {
    title,
    description,
    goal,
    industry,
    platforms,
    contentTypes,
    deliverables,
    keyMessage,
    dos,
    donts,
    referenceLinks,
    creatorNiches,
    followerTiers,
    minEngagement,
    audienceLocations,
    audienceAgeRanges,
    preferredGender,
    contentLanguage,
    compensationType,
    budgetMin,
    budgetMax,
    openToNegotiation,
    giftingDetails,
    usageRights,
    exclusivityPeriod,
    applicationDeadline,
    submissionDeadline,
    postingDate,
    revisionRounds,
    creatorsNeeded,
    visibility,
    applicationQuestion,
    coverImage,
    status,
  } = req.body;

  const updateFields = {
    ...(title !== undefined && { title: title.trim() }),
    ...(description !== undefined && { description }),
    ...(goal !== undefined && { goal }),
    ...(industry !== undefined && { industry }),
    ...(platforms !== undefined && { platforms }),
    ...(contentTypes !== undefined && { content_types: contentTypes }),
    ...(deliverables !== undefined && { deliverables: deliverables !== "" ? Number(deliverables) : null }),
    ...(keyMessage !== undefined && { key_message: keyMessage }),
    ...(dos !== undefined && { dos }),
    ...(donts !== undefined && { donts }),
    ...(referenceLinks !== undefined && { reference_links: referenceLinks.filter(Boolean) }),
    ...(creatorNiches !== undefined && { creator_niches: creatorNiches }),
    ...(followerTiers !== undefined && { follower_tiers: followerTiers }),
    ...(minEngagement !== undefined && { min_engagement: minEngagement }),
    ...(audienceLocations !== undefined && { audience_locations: audienceLocations }),
    ...(audienceAgeRanges !== undefined && { audience_age_ranges: audienceAgeRanges }),
    ...(preferredGender !== undefined && { preferred_gender: preferredGender }),
    ...(contentLanguage !== undefined && { content_language: contentLanguage }),
    ...(compensationType !== undefined && { compensation_type: compensationType }),
    ...(budgetMin !== undefined && { budget_min: budgetMin ? Number(budgetMin) : null }),
    ...(budgetMax !== undefined && { budget_max: budgetMax ? Number(budgetMax) : null }),
    ...(openToNegotiation !== undefined && { open_to_negotiation: openToNegotiation }),
    ...(giftingDetails !== undefined && { gifting_details: giftingDetails }),
    ...(usageRights !== undefined && { usage_rights: usageRights }),
    ...(exclusivityPeriod !== undefined && { exclusivity_period: exclusivityPeriod }),
    ...(applicationDeadline !== undefined && { application_deadline: applicationDeadline }),
    ...(submissionDeadline !== undefined && { submission_deadline: submissionDeadline }),
    ...(postingDate !== undefined && { posting_date: postingDate }),
    ...(revisionRounds !== undefined && { revision_rounds: revisionRounds }),
    ...(creatorsNeeded !== undefined && { creators_needed: creatorsNeeded !== "" ? Number(creatorsNeeded) : null }),
    ...(visibility !== undefined && { visibility }),
    ...(applicationQuestion !== undefined && { application_question: applicationQuestion }),
    ...(coverImage !== undefined && { cover_image: coverImage }),
    ...(status !== undefined && { status }),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("campaigns")
    .update(updateFields)
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/campaigns/:id/status  — change campaign status         */
/* ------------------------------------------------------------------ */
router.patch("/:id/status", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const { status } = req.body;

  if (!["draft", "published", "closed", "archived"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const brand = await getBrand(user.id);
  if (!brand) {
    return res.status(403).json({ message: "Only brand accounts can update campaign status" });
  }

  const { data: existing } = await supabase
    .from("campaigns")
    .select("brand_id")
    .eq("id", id)
    .single();

  if (!existing) return res.status(404).json({ message: "Campaign not found" });
  if (existing.brand_id !== user.id) return res.status(403).json({ message: "Forbidden" });

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/campaigns/:id  — delete a campaign (owning brand only) */
/* ------------------------------------------------------------------ */
router.delete("/:id", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const brand = await getBrand(user.id);
  if (!brand) {
    return res.status(403).json({ message: "Only brand accounts can delete campaigns" });
  }

  const { data: existing } = await supabase
    .from("campaigns")
    .select("brand_id")
    .eq("id", id)
    .single();

  if (!existing) return res.status(404).json({ message: "Campaign not found" });
  if (existing.brand_id !== user.id) return res.status(403).json({ message: "Forbidden" });

  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "Campaign deleted" });
});

export default router;

import express from "express";
import supabase from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/* ------------------------------------------------------------------ */
/*  POST /api/campaigns  — create a campaign (brands only)            */
/* ------------------------------------------------------------------ */
router.post("/", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  // Verify brand role
  const { data: brand } = await supabase
    .from("creators")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!brand || brand.role !== "brand") {
    return res.status(403).json({ message: "Only brand accounts can create campaigns" });
  }

  const {
    title, description, goal, industry,
    platforms, contentTypes, deliverables, keyMessage, dos, donts, referenceLinks,
    creatorNiches, followerTiers, minEngagement, audienceLocations, audienceAgeRanges,
    preferredGender, contentLanguage,
    compensationType, budgetMin, budgetMax, openToNegotiation, giftingDetails,
    usageRights, exclusivityPeriod,
    applicationDeadline, submissionDeadline, postingDate, revisionRounds,
    creatorsNeeded, visibility, applicationQuestion, coverImage,
  } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({ message: "Campaign title is required" });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert([{
      brand_id: user.id,
      title: title.trim(),
      description: description || null,
      goal: goal || null,
      industry: industry || null,
      platforms: platforms || [],
      content_types: contentTypes || [],
      deliverables: deliverables !== "" ? Number(deliverables) : null,
      key_message: keyMessage || null,
      dos: dos || null,
      donts: donts || null,
      reference_links: (referenceLinks || []).filter(Boolean),
      creator_niches: creatorNiches || [],
      follower_tiers: followerTiers || [],
      min_engagement: minEngagement || null,
      audience_locations: audienceLocations || [],
      audience_age_ranges: audienceAgeRanges || [],
      preferred_gender: preferredGender || null,
      content_language: contentLanguage || null,
      compensation_type: compensationType || null,
      budget_min: budgetMin ? Number(budgetMin) : null,
      budget_max: budgetMax ? Number(budgetMax) : null,
      open_to_negotiation: openToNegotiation ?? false,
      gifting_details: giftingDetails || null,
      usage_rights: usageRights || null,
      exclusivity_period: exclusivityPeriod || null,
      application_deadline: applicationDeadline || null,
      submission_deadline: submissionDeadline || null,
      posting_date: postingDate || null,
      revision_rounds: revisionRounds ?? 2,
      creators_needed: creatorsNeeded !== "" ? Number(creatorsNeeded) : null,
      visibility: visibility || "public",
      application_question: applicationQuestion || null,
      cover_image: coverImage || null,
      status: "published",
    }])
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.status(201).json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/campaigns/my  — brand's own campaigns                     */
/* ------------------------------------------------------------------ */
router.get("/my", authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user?.id) return res.status(400).json({ message: "User info missing" });

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("brand_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/campaigns  — all public published campaigns               */
/* ------------------------------------------------------------------ */
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, brand:creators!campaigns_brand_id_fkey(name, username)")
    .eq("visibility", "public")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  GET /api/campaigns/:id  — single campaign                          */
/* ------------------------------------------------------------------ */
router.get("/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, brand:creators!campaigns_brand_id_fkey(name, username)")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ message: "Campaign not found" });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  PUT /api/campaigns/:id  — update campaign (owning brand only)      */
/* ------------------------------------------------------------------ */
router.put("/:id", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const { data: existing } = await supabase
    .from("campaigns")
    .select("brand_id")
    .eq("id", id)
    .single();

  if (!existing) return res.status(404).json({ message: "Campaign not found" });
  if (existing.brand_id !== user.id) return res.status(403).json({ message: "Forbidden" });

  const {
    title, description, goal, industry,
    platforms, contentTypes, deliverables, keyMessage, dos, donts, referenceLinks,
    creatorNiches, followerTiers, minEngagement, audienceLocations, audienceAgeRanges,
    preferredGender, contentLanguage,
    compensationType, budgetMin, budgetMax, openToNegotiation, giftingDetails,
    usageRights, exclusivityPeriod,
    applicationDeadline, submissionDeadline, postingDate, revisionRounds,
    creatorsNeeded, visibility, applicationQuestion, coverImage, status,
  } = req.body;

  const fields = {
    ...(title !== undefined && { title: title.trim() }),
    ...(description !== undefined && { description }),
    ...(goal !== undefined && { goal }),
    ...(industry !== undefined && { industry }),
    ...(platforms !== undefined && { platforms }),
    ...(contentTypes !== undefined && { content_types: contentTypes }),
    ...(deliverables !== undefined && { deliverables: deliverables !== "" ? Number(deliverables) : null }),
    ...(keyMessage !== undefined && { key_message: keyMessage }),
    ...(dos !== undefined && { dos }),
    ...(donts !== undefined && { donts }),
    ...(referenceLinks !== undefined && { reference_links: referenceLinks.filter(Boolean) }),
    ...(creatorNiches !== undefined && { creator_niches: creatorNiches }),
    ...(followerTiers !== undefined && { follower_tiers: followerTiers }),
    ...(minEngagement !== undefined && { min_engagement: minEngagement }),
    ...(audienceLocations !== undefined && { audience_locations: audienceLocations }),
    ...(audienceAgeRanges !== undefined && { audience_age_ranges: audienceAgeRanges }),
    ...(preferredGender !== undefined && { preferred_gender: preferredGender }),
    ...(contentLanguage !== undefined && { content_language: contentLanguage }),
    ...(compensationType !== undefined && { compensation_type: compensationType }),
    ...(budgetMin !== undefined && { budget_min: budgetMin ? Number(budgetMin) : null }),
    ...(budgetMax !== undefined && { budget_max: budgetMax ? Number(budgetMax) : null }),
    ...(openToNegotiation !== undefined && { open_to_negotiation: openToNegotiation }),
    ...(giftingDetails !== undefined && { gifting_details: giftingDetails }),
    ...(usageRights !== undefined && { usage_rights: usageRights }),
    ...(exclusivityPeriod !== undefined && { exclusivity_period: exclusivityPeriod }),
    ...(applicationDeadline !== undefined && { application_deadline: applicationDeadline }),
    ...(submissionDeadline !== undefined && { submission_deadline: submissionDeadline }),
    ...(postingDate !== undefined && { posting_date: postingDate }),
    ...(revisionRounds !== undefined && { revision_rounds: revisionRounds }),
    ...(creatorsNeeded !== undefined && { creators_needed: creatorsNeeded !== "" ? Number(creatorsNeeded) : null }),
    ...(visibility !== undefined && { visibility }),
    ...(applicationQuestion !== undefined && { application_question: applicationQuestion }),
    ...(coverImage !== undefined && { cover_image: coverImage }),
    ...(status !== undefined && { status }),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("campaigns")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/campaigns/:id                                           */
/* ------------------------------------------------------------------ */
router.delete("/:id", authMiddleware, async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const { data: existing } = await supabase
    .from("campaigns")
    .select("brand_id")
    .eq("id", id)
    .single();

  if (!existing) return res.status(404).json({ message: "Campaign not found" });
  if (existing.brand_id !== user.id) return res.status(403).json({ message: "Forbidden" });

  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "Campaign deleted" });
});

export default router;
