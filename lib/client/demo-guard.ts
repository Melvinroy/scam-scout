/** A recorded example may fill the field only while the opening input is unchanged and no check has started. It never starts a live run. */
export function recordedReplayMayStart(input: string, liveActive: boolean, initialInput = "", openingReplay = true): boolean {
  return openingReplay && !liveActive && input.trim() === initialInput.trim();
}

/** The opening replay applies only if no later submit or preset has taken the desk. */
export function generationStillCurrent(started: number, current: number): boolean {
  return started === current;
}

/** A signed-in owner types their own subject. The opening recording does not fill the field. */
export function openingReplayInput(liveOwner: boolean, packInput?: string, presetInput?: string): string {
  if (liveOwner) return "";
  return packInput || presetInput || "";
}
