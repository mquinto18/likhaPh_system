import express from "express";
import cors from "cors";
import creatorRoutes from "./routes/creatorRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import portfolioRoutes from "./routes/portfolioRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
const app = express();

app.use(cors({
  origin: [
    "https://liik-ph.vercel.app",
    "http://localhost:8080",
    "http://localhost:5173",
    "http://localhost:4173",
  ],
  credentials: true,
}));
app.use(express.json());

app.use("/api/creators", creatorRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/notifications", notificationRoutes);

export default app;
