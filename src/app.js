import express from "express";
import cors from "cors";
import creatorRoutes from "./routes/creatorRoutes.js";
import authRoutes from "./routes/authRoutes.js";
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/creators", creatorRoutes);
app.use("/api/auth", authRoutes);

export default app;
