import supabase from "../config/supabase.js";

async function checkAndNotifyEndedCampaigns() {
  try {
    const now = new Date().toISOString();
    // Look back 7 days — dedup check prevents re-sending; wide window covers server downtime
    const lookbackCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: endedCampaigns, error } = await supabase
      .from("campaigns")
      .select("id, title, brand_id")
      .lte("application_deadline", now)
      .gte("application_deadline", lookbackCutoff);

    if (error || !endedCampaigns?.length) return;

    for (const campaign of endedCampaigns) {
      // Find all active (non-withdrawn) applicants
      const { data: applications } = await supabase
        .from("applications")
        .select("id, creator_id, status")
        .eq("campaign_id", campaign.id)
        .neq("status", "withdrawn");

      // ── Notify creators (dedup per campaign) ──────────────────────
      if (applications?.length) {
        const { data: existingCreatorNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "campaign_ended")
          .contains("data", { campaign_id: campaign.id })
          .limit(1);

        if (!existingCreatorNotif?.length) {
          const notifications = applications.map((app) => ({
            user_id: app.creator_id,
            type: "campaign_ended",
            title: "Campaign has ended",
            body: `The campaign "${campaign.title}" you applied to has closed. Check your application status.`,
            data: { campaign_id: campaign.id, application_id: app.id },
          }));
          await supabase.from("notifications").insert(notifications);
        }
      }

      // ── Notify brand (dedup per campaign) ─────────────────────────
      if (campaign.brand_id) {
        const { data: existingBrandNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "campaign_deadline_passed")
          .contains("data", { campaign_id: campaign.id })
          .limit(1);

        if (!existingBrandNotif?.length) {
          const pendingCount = (applications ?? []).filter((a) => a.status === "pending").length;
          await supabase.from("notifications").insert([{
            user_id: campaign.brand_id,
            type: "campaign_deadline_passed",
            title: "Campaign deadline reached",
            body: pendingCount > 0
              ? `Your campaign "${campaign.title}" has closed with ${pendingCount} pending applicant${pendingCount !== 1 ? "s" : ""}. Review and finalize your selections.`
              : `Your campaign "${campaign.title}" has closed.`,
            data: { campaign_id: campaign.id },
          }]);
        }
      }
    }
  } catch (err) {
    console.error("[campaignEndedNotifier]", err.message);
  }
}

export function startCampaignEndedNotifier() {
  checkAndNotifyEndedCampaigns();
  setInterval(checkAndNotifyEndedCampaigns, 60 * 60 * 1000); // every hour
}
