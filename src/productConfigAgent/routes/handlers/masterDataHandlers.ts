import type { Request, Response } from "express";
import { productConfigAgentService } from "../../service.js";
import { optionalNumber, optionalString, requireModelTermType, requireString } from "../params.js";

export const masterDataModelBinding = async (request: Request, response: Response) => {
  const termType = optionalString(request.query.termType ?? request.query.term_type) ?? undefined;
  const rawValue = optionalString(request.query.rawValue ?? request.query.raw_value);
  if (rawValue && (termType === "filter_model" || termType === "metering_pump_model")) {
    response.json(
      await productConfigAgentService.matchMasterDataModel({
        termType,
        rawValue,
      }),
    );
    return;
  }
  response.json({
    migratedToPrisma: true,
    ...(await productConfigAgentService.searchMasterDataModelBinding({
      termType,
      q: optionalString(request.query.q ?? request.query.query) ?? undefined,
      model: optionalString(request.query.model) ?? undefined,
      limit: optionalNumber(request.query.limit),
    })),
  });
};

export const masterDataModelBindingPost = async (request: Request, response: Response) => {
  response.json(
    await productConfigAgentService.bindMasterDataModel({
      documentId: optionalString(request.body?.documentId) ?? undefined,
      extractionResultId: requireString(request.body?.extractionResultId, "extractionResultId"),
      itemIndex: optionalNumber(request.body?.itemIndex) ?? Number(requireString(request.body?.item_index, "itemIndex")),
      termType: requireModelTermType(request.body?.termType ?? request.body?.term_type),
      rawValue: requireString(request.body?.rawValue ?? request.body?.raw_value, "rawValue"),
      masterDataId: requireString(request.body?.masterDataId ?? request.body?.master_data_id, "masterDataId"),
    }),
  );
};
