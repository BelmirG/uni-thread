import { clearFeedCache } from "./feedCache";
import { clearQACache } from "./qaCache";
import { clearProfileCaches } from "./profileCache";
import { clearChatCaches } from "./chatCache";

export function clearAllPageCaches(): void {
  clearFeedCache();
  clearQACache();
  clearProfileCaches();
  clearChatCaches();
}
