"use client";

import { useSyncExternalStore } from "react";

/** Never notifies: the value flips once, from the server snapshot to the client
 *  one, which is exactly "have we hydrated yet". The kit uses the same trick in
 *  SectionNav/DevHud, but keeps the constant module-private, so it lives here. */
const NEVER = () => () => {};

/** True only after hydration — the gate every portal needs, since `document`
 *  does not exist during the server render. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    NEVER,
    () => true,
    () => false,
  );
}
