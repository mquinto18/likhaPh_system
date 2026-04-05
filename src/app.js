import express from "express";
import cors from "cors";
import creatorRoutes from "./routes/creatorRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import portfolioRoutes from "./routes/portfolioRoutes.js";
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/creators", creatorRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/portfolio", portfolioRoutes);

export default app;
