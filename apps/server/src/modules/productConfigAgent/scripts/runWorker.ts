import "../../../config/env.js";
import { productConfigAgentWorker } from "../worker/backgroundWorker.js";

productConfigAgentWorker.start();
console.log("[productConfigAgentWorker] started");
