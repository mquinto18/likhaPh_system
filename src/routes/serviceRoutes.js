import express from "express";
import supabase from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Get all services for a specific creator (public)
router.get("/:creatorId", async (req, res) => {
  const { creatorId } = req.params;
  const { data, error } = await supabase
    .from("creator_services")
    .select("*")
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: true });
  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

// Get all services for the current logged-in user
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { data, error } = await supabase
    .from("creator_services")
    .select("*")
    .eq("creator_id", userId)
    .order("created_at", { ascending: true });
  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

// Add a new service
router.post("/", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { name, price, description, delivery_time } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Service name is required" });
  }

  const { data, error } = await supabase
    .from("creator_services")
    .insert([
      {
        creator_id: userId,
        name: name.trim(),
        price: price || null,
        description: description || null,
        delivery_time: delivery_time || null,
      },
    ])
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.status(201).json(data);
});

// Update a service
router.put("/:serviceId", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.params;
  const { name, price, description, delivery_time } = req.body;

  // Verify ownership
  const { data: existing } = await supabase
    .from("creator_services")
    .select("creator_id")
    .eq("id", serviceId)
    .single();

  if (!existing || existing.creator_id !== userId) {
    return res.status(403).json({ message: "Not authorized" });
  }

  const { data, error } = await supabase
    .from("creator_services")
    .update({
      name: name?.trim(),
      price: price || null,
      description: description || null,
      delivery_time: delivery_time || null,
    })
    .eq("id", serviceId)
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
});

// Delete a service
router.delete("/:serviceId", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.params;

  // Verify ownership
  const { data: existing } = await supabase
    .from("creator_services")
    .select("creator_id")
    .eq("id", serviceId)
    .single();

  if (!existing || existing.creator_id !== userId) {
    return res.status(403).json({ message: "Not authorized" });
  }

  const { error } = await supabase
    .from("creator_services")
    .delete()
    .eq("id", serviceId);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "Service deleted" });
});

export default router;
