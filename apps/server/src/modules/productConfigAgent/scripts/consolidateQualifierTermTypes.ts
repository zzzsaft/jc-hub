import "../../../config/env.js";
import { productConfigAgentRepository } from "../db.service.js";

console.log(JSON.stringify(await productConfigAgentRepository.createHealthReport("consolidate-qualifier-terms"), null, 2));
