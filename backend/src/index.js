import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDb, purgeOld } from "./db/db.js";
import apiRouter from "./routes/index.js";
import { rateLimit, inputLimit } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT || 8010;

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "200kb" }));
app.use(inputLimit);
app.use(rateLimit({ windowMs: 60_000, max: 30 }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "soide-backend" }));
app.get("/", (_req, res) => res.json({ ok: true, service: "soide-backend", api: "/api" }));

initDb();
try { const n = purgeOld(30); if (n) console.log(`[soide] purged ${n} checks >30d`); } catch {}
app.use("/api", apiRouter);
app.use((_req, res) => res.status(404).json({ error_code: "NOT_FOUND", message_vi: "Không tìm thấy API.", retryable: false }));
app.use(errorHandler);

app.listen(PORT, () => console.log(`[soide-backend] http://localhost:${PORT}`));
