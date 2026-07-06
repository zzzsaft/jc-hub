import dotenv from "dotenv";

dotenv.config();

process.env.TZ = process.env.TZ || "Asia/Shanghai";
process.env.PORT ||= process.env.NODE_ENV === "production" ? "2000" : "2001";
