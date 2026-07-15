import { clearFeedCache } from "./feedCache";
import { clearQACache } from "./qaCache";
import { clearProfileCaches } from "./profileCache";
import { clearChatCaches } from "./chatCache";

// One account's snapshots must never survive into another account's session
// on the same device — call on login and logout.
export function clearAllPageCaches(): void {
  clearFeedCache();
  clearQACache();
  clearProfileCaches();
  clearChatCaches();
}
