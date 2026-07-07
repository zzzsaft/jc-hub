import "../../../config/env.js";
import { productConfigAgentRepository } from "../db.service.js";

console.log(JSON.stringify(await productConfigAgentRepository.enqueueJob({
  jobType: "excel_blocks_upgrade",
  payloadJson: { source: "script" },
}), null, 2));
