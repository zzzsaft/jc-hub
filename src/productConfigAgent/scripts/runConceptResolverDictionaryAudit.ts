import "../../../config/env.js";
import { productConfigAgentRepository } from "../db.service.js";

console.log(JSON.stringify(await productConfigAgentRepository.createHealthReport("script"), null, 2));
