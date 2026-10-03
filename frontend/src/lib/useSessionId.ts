import { useState } from "react";

/** One random id per page load, sent with /chat and /share so the audit log can group a session. */
export function useSessionId(): string {
  const [sessionId] = useState(() => crypto.randomUUID());
  return sessionId;
}
