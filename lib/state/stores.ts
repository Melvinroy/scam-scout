"use client";

import { create } from "zustand";
import { toIntents, type Intent } from "@/lib/choreo/choreographer";
import { applyFinishedReport, emptyCase, reduceCase, runningCase, type CaseView } from "@/lib/case/reducer";
import { applyIntent, initialWorld, stepWorld, type WorldSnapshot } from "@/lib/world/sim";
import type { AgentEvent, CaseReport } from "@/lib/types";

interface CaseStore extends CaseView {
  reset: () => void;
}

interface WorldStore {
  world: WorldSnapshot;
  reduced: boolean;
  mode: "3d" | "2d";
  setMode: (mode: "3d" | "2d") => void;
  setReduced: (reduced: boolean) => void;
  reset: () => void;
  step: (dt: number) => void;
  select: (callId: string | null) => void;
}

export const useCase = create<CaseStore>((set) => ({
  ...emptyCase(),
  reset: () => set({ ...emptyCase(), verdict: undefined, error: undefined, report: undefined, replayMessage: undefined }),
}));

export const useWorld = create<WorldStore>((set) => ({
  world: initialWorld(),
  reduced: false,
  mode: "3d",
  setMode: (mode) => set({ mode }),
  setReduced: (reduced) => set({ reduced }),
  reset: () => set({ world: initialWorld() }),
  step: (dt) => set((state) => ({ world: stepWorld(state.world, dt, state.reduced) })),
  select: (callId) => set((state) => ({ world: { ...state.world, selectedCallId: callId } })),
}));

export function resetInvestigation(): void {
  useCase.getState().reset();
  useWorld.getState().reset();
}

export function beginLiveCheck(input: string): void {
  useCase.setState(runningCase(input));
  useWorld.getState().reset();
}

export function publishFinishedReport(report: CaseReport): void {
  useCase.setState(applyFinishedReport(useCase.getState(), report));
}

export function publishEvent(event: AgentEvent): void {
  useCase.setState(reduceCase(useCase.getState(), event));
  let world = useWorld.getState().world;
  for (const intent of toIntents(event)) world = applyIntent(world, intent);
  useWorld.setState({ world });
}

export function applyWorldIntent(intent: Intent): void {
  useWorld.setState({ world: applyIntent(useWorld.getState().world, intent) });
}
