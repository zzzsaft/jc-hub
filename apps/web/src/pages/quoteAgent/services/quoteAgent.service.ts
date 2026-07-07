import { quoteAgentArchiveService } from "./quoteAgentArchive.service";
import { quoteAgentCandidateService } from "./quoteAgentCandidate.service";
import { quoteAgentDictionaryService } from "./quoteAgentDictionary.service";
import { quoteAgentMasterDataService } from "./quoteAgentMasterData.service";

export { quoteAgentArchiveService } from "./quoteAgentArchive.service";
export { quoteAgentCandidateService } from "./quoteAgentCandidate.service";
export { quoteAgentDictionaryService } from "./quoteAgentDictionary.service";
export { quoteAgentMasterDataService } from "./quoteAgentMasterData.service";

export const quoteAgentService = {
  ...quoteAgentArchiveService,
  ...quoteAgentDictionaryService,
  ...quoteAgentCandidateService,
  ...quoteAgentMasterDataService,
};
