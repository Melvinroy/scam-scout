import { pathLength, pathPoints, pointAlong, shortestPath } from "@/lib/choreo/pathfinding";
import type { Intent } from "@/lib/choreo/choreographer";
import { presentationScale } from "@/lib/choreo/choreographer";

export interface ActorCard {
  evidenceId: string;
  sourceType: string;
  title: string;
  signalId?: string;
}

export interface Actor {
  callId: string;
  job: string;
  destination: string;
  query: string;
  phase: "walk" | "work" | "carry" | "shrug" | "done";
  path: Array<[number, number, number]>;
  progress: number;
  facing: number;
  position: [number, number, number];
  cards: ActorCard[];
  pending: ActorCard[];
  failed: boolean;
  ready: boolean;
  work: number;
}

export interface IslandReaction {
  count?: number;
  urls?: string[];
  beacon?: "red" | "green";
  paths?: string[];
  missing?: string[];
  oddPaths?: string[];
  copycats?: string[];
  finding?: string;
  ageDays?: number;
  rooms?: string[];
  closed?: boolean;
}

export interface WorldSnapshot {
  awake: boolean;
  label: string;
  priors: Record<string, number>;
  actors: Actor[];
  reactions: Record<string, IslandReaction>;
  score: number;
  stamp: string | null;
  lowConfidence: boolean;
  dim: boolean;
  celebrate: boolean;
  memo: boolean;
  reason: string;
  credits: number;
  tokens: number;
  selectedCallId: string | null;
  queue: number;
}

export function initialWorld(): WorldSnapshot {
  return {
    awake: false,
    label: "",
    priors: {},
    actors: [],
    reactions: {},
    score: 0,
    stamp: null,
    lowConfidence: false,
    dim: false,
    celebrate: false,
    memo: false,
    reason: "",
    credits: 0,
    tokens: 0,
    selectedCallId: null,
    queue: 0,
  };
}

export function applyIntent(world: WorldSnapshot, intent: Intent): WorldSnapshot {
  const next: WorldSnapshot = { ...world, actors: world.actors.map((actor) => ({ ...actor, cards: [...actor.cards], pending: [...actor.pending] })), reactions: { ...world.reactions } };
  switch (intent.type) {
    case "world.wake":
      next.awake = true;
      next.label = intent.entityLabel;
      break;
    case "board.pin":
      next.label = intent.label;
      break;
    case "board.flags":
      next.priors = intent.priors;
      break;
    case "dispatcher.point":
      next.reason = intent.reason;
      break;
    case "scout.spawn": {
      if (!intent.callId || next.actors.some((actor) => actor.callId === intent.callId)) break;
      const ids = shortestPath("hq", intent.destination);
      const path = pathPoints(ids);
      next.actors = [
        ...next.actors,
        {
          callId: intent.callId,
          job: intent.job,
          destination: intent.destination,
          query: intent.query,
          phase: "walk",
          path,
          progress: 0,
          facing: 0,
          position: path[0] ?? [0, 0, 0],
          cards: [],
          pending: [],
          failed: false,
          ready: false,
          work: 0,
        },
      ];
      break;
    }
    case "island.react": {
      const prev = next.reactions[intent.destination] ?? {};
      const urls = Array.isArray(intent.payload.result_urls) ? (intent.payload.result_urls as string[]) : prev.urls;
      next.reactions[intent.destination] = {
        ...prev,
        count: Number(intent.payload.result_count ?? urls?.length ?? prev.count ?? 0),
        urls,
        beacon: (intent.payload.beacon as "red" | "green" | undefined) ?? prev.beacon,
        paths: (intent.payload.paths as string[]) ?? prev.paths,
        missing: (intent.payload.missing as string[]) ?? prev.missing,
        oddPaths: (intent.payload.odd_paths as string[]) ?? prev.oddPaths,
        copycats: (intent.payload.copycats as string[]) ?? prev.copycats,
        finding: typeof intent.payload.finding === "string" ? intent.payload.finding : prev.finding,
        ageDays: typeof intent.payload.age_days === "number" ? intent.payload.age_days : prev.ageDays,
        rooms: (intent.payload.rooms as string[]) ?? prev.rooms,
        closed: Boolean(intent.payload.closed) || prev.closed,
      };
      if (intent.callId) {
        next.actors = next.actors.map((actor) => (actor.callId === intent.callId ? { ...actor, ready: true } : actor));
      }
      break;
    }
    case "scout.pickUp":
      next.actors = next.actors.map((actor) => {
        if (actor.callId !== intent.callId) return actor;
        const card = { evidenceId: intent.evidenceId, sourceType: intent.sourceType, title: intent.title };
        return { ...actor, pending: [...actor.pending, card].slice(0, 3) };
      });
      break;
    case "card.ribbon":
      next.actors = next.actors.map((actor) => ({
        ...actor,
        cards: actor.cards.map((card) => (intent.evidenceIds.includes(card.evidenceId) ? { ...card, signalId: intent.signalId } : card)),
        pending: actor.pending.map((card) => (intent.evidenceIds.includes(card.evidenceId) ? { ...card, signalId: intent.signalId } : card)),
      }));
      break;
    case "scout.shrug":
      next.actors = next.actors.map((actor) => (actor.callId === intent.callId ? { ...actor, failed: true, ready: true } : actor));
      break;
    case "budget.update":
      next.credits = intent.credits;
      next.tokens = intent.tokens;
      break;
    case "scale.tilt":
      next.score = intent.score;
      break;
    case "scouts.recall":
      next.reason = intent.reason;
      next.actors = next.actors.map((actor) => (actor.phase === "work" ? { ...actor, ready: true } : actor));
      break;
    case "chief.stamp":
      next.stamp = intent.level;
      next.lowConfidence = intent.lowConfidence;
      break;
    case "typology.tab":
      break;
    case "celebrate":
      next.celebrate = true;
      break;
    case "memo.unroll":
      next.memo = true;
      break;
    case "hq.dim":
      next.dim = true;
      break;
    case "replay.badge":
      break;
    default:
      break;
  }
  return next;
}

export function stepWorld(world: WorldSnapshot, dt: number, reducedMotion = false): WorldSnapshot {
  const scale = presentationScale(world.actors.filter((actor) => actor.phase === "walk" || actor.phase === "carry").length);
  const actors = world.actors.map((actor) => advance(actor, dt, scale, reducedMotion));
  return { ...world, actors };
}

function advance(actor: Actor, dt: number, scale: number, reduced: boolean): Actor {
  if (actor.phase === "done") return actor;
  if (reduced) {
    const end = actor.path[actor.path.length - 1] ?? actor.position;
    return { ...actor, phase: "done", progress: 1, position: end, cards: [...actor.cards, ...actor.pending], pending: [] };
  }
  if (actor.phase === "work") {
    const work = actor.work + dt;
    const leave = actor.ready && work > 0.7;
    if (!leave) return { ...actor, work };
    if (actor.failed && actor.pending.length === 0) return turnBack(actor, "shrug");
    if (actor.pending.length || actor.cards.length) return turnBack({ ...actor, cards: [...actor.cards, ...actor.pending], pending: [] }, "carry");
    return turnBack(actor, "shrug");
  }
  const length = Math.max(pathLength(actor.path), 0.001);
  const progress = actor.progress + (1.6 * scale * dt) / length;
  const sample = pointAlong(actor.path, Math.min(progress, 1));
  if (progress >= 1) {
    if (actor.phase === "walk") {
      return { ...actor, progress: 1, position: sample.position, facing: sample.facing, phase: "work", work: 0 };
    }
    return { ...actor, progress: 1, position: sample.position, facing: sample.facing, phase: "done" };
  }
  return { ...actor, progress, position: sample.position, facing: sample.facing };
}

function turnBack(actor: Actor, phase: "carry" | "shrug"): Actor {
  const home = pathPoints(shortestPath(actor.destination, "hq"));
  return { ...actor, phase, path: home, progress: 0, work: 0 };
}
