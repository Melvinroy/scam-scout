import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CaptureRecord, CaptureSummary } from "@/lib/captures/types";
import type { AuditRecord } from "@/lib/safety/audit";
import { auditSubject } from "@/lib/safety/audit";
import { reportRetentionMs, runtimeEnv } from "@/lib/config";
import { verdictStamp } from "@/lib/ui/live-sheet";

export interface AccountRecord {
  used: number;
  bonus: number;
  codes: string[];
}

export interface ReserveResult {
  ok: boolean;
  value: number;
}

export function applyAccountReserve(record: AccountRecord, baseAllowance: number, floor = 0): { ok: boolean; record: AccountRecord } {
  const next: AccountRecord = { used: record.used, bonus: record.bonus, codes: [...record.codes] };
  if (next.used < floor) next.used = floor;
  if (next.used >= baseAllowance + next.bonus) return { ok: false, record: next };
  next.used += 1;
  return { ok: true, record: next };
}

export const RESERVE_ACCOUNT_LUA = `
local raw = redis.call('GET', KEYS[1])
local used = 0
local bonus = 0
local codes = {}
if raw then
  local ok, parsed = pcall(cjson.decode, raw)
  if ok and type(parsed) == 'table' then
    used = tonumber(parsed.used) or 0
    bonus = tonumber(parsed.bonus) or 0
    if type(parsed.codes) == 'table' then codes = parsed.codes end
  end
end
local floor = tonumber(ARGV[2]) or 0
if used < floor then used = floor end
local allowance = tonumber(ARGV[1]) + bonus
if used >= allowance then
  redis.call('SET', KEYS[1], cjson.encode({used=used, bonus=bonus, codes=codes}))
  return cjson.encode({ok=false, used=used, bonus=bonus, codes=codes})
end
used = used + 1
redis.call('SET', KEYS[1], cjson.encode({used=used, bonus=bonus, codes=codes}))
return cjson.encode({ok=true, used=used, bonus=bonus, codes=codes})
`;

export const RESERVE_COUNT_LUA = `
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= limit then
  return {0, current}
end
local next = redis.call('INCR', KEYS[1])
local ttlLeft = redis.call('PTTL', KEYS[1])
if next == 1 or ttlLeft < 0 then redis.call('PEXPIRE', KEYS[1], ttl) end
if next > limit then
  redis.call('DECR', KEYS[1])
  return {0, next - 1}
end
return {1, next}
`;

export const RESERVE_CREDITS_LUA = `
local amount = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current + amount > cap then
  return {0, current}
end
local next = redis.call('INCRBY', KEYS[1], amount)
if next > cap then
  redis.call('DECRBY', KEYS[1], amount)
  return {0, next - amount}
end
return {1, next}
`;

export const RELEASE_ACCOUNT_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({used=0, bonus=0, codes={}}) end
local ok, parsed = pcall(cjson.decode, raw)
if not ok or type(parsed) ~= 'table' then return raw end
local used = tonumber(parsed.used) or 0
if used > 0 then used = used - 1 end
parsed.used = used
local encoded = cjson.encode(parsed)
redis.call('SET', KEYS[1], encoded)
return encoded
`;

export interface UsageStore {
  getAccount(id: string): Promise<AccountRecord>;
  ensureUsed(id: string, used: number): Promise<AccountRecord>;
  incrementUsed(id: string): Promise<AccountRecord>;
  addBonus(id: string, code: string, amount: number): Promise<AccountRecord>;
  getCount(key: string): Promise<number>;
  increment(key: string, ttlMs: number): Promise<number>;
  getCredits(day: string): Promise<number>;
  addCredits(day: string, amount: number): Promise<number>;
  reserveAccount(id: string, baseAllowance: number, floor?: number): Promise<{ ok: boolean; record: AccountRecord }>;
  releaseAccount(id: string): Promise<AccountRecord>;
  reserveCount(key: string, ttlMs: number, limit: number): Promise<ReserveResult>;
  releaseCount(key: string): Promise<number>;
  reserveCredits(day: string, amount: number, cap: number): Promise<ReserveResult>;
  releaseCredits(day: string, amount: number): Promise<number>;
  saveReport(id: string, report: unknown): Promise<void>;
  getReport<T = unknown>(id: string): Promise<T | null>;
  appendAudit(event: AuditRecord): Promise<void>;
  saveCapture(record: CaptureRecord): Promise<void>;
  listCaptures(): Promise<CaptureSummary[]>;
  getCapture(id: string): Promise<CaptureRecord | null>;
  markPromoted(id: string, previewId: string): Promise<CaptureRecord | null>;
  deleteCapture(id: string): Promise<boolean>;
}

type StoredReport = { savedAt: number; report: unknown };

type MemoryShape = {
  accounts: Record<string, AccountRecord>;
  counters: Record<string, { value: number; expires: number }>;
  credits: Record<string, number>;
  reports: Record<string, StoredReport | unknown>;
  audits: Record<string, { savedAt: number; record: AuditRecord }>;
  captures: Record<string, CaptureRecord>;
  captureOrder: string[];
};

function emptyShape(): MemoryShape {
  return { accounts: {}, counters: {}, credits: {}, reports: {}, audits: {}, captures: {}, captureOrder: [] };
}

function summarizeCapture(row: CaptureRecord): CaptureSummary {
  const tavilyCredits = typeof row.tavilyCredits === "number" ? row.tavilyCredits : row.report?.costs?.tavily_credits;
  const nebiusUsd = typeof row.nebiusUsd === "number" ? row.nebiusUsd : row.report?.costs?.nebius_usd;
  return {
    id: row.id,
    createdAt: row.createdAt,
    input: row.input,
    verdict: verdictStamp(row.report?.verdict),
    ...(typeof tavilyCredits === "number" ? { tavilyCredits } : {}),
    ...(typeof nebiusUsd === "number" ? { nebiusUsd } : {}),
    promoted: row.promoted,
    previewId: row.previewId,
  };
}

function retentionSeconds(): number {
  return Math.max(60, Math.round(reportRetentionMs() / 1000));
}

function unwrapReport<T>(row: StoredReport | unknown, now: number): T | null {
  if (!row || typeof row !== "object") return (row as T) ?? null;
  const wrapped = row as StoredReport;
  if (typeof wrapped.savedAt === "number" && "report" in wrapped) {
    if (now - wrapped.savedAt > reportRetentionMs()) return null;
    return wrapped.report as T;
  }
  return row as T;
}

export class MemoryUsageStore implements UsageStore {
  private data: MemoryShape = emptyShape();

  constructor(private readonly now: () => number = Date.now) {}

  snapshot(): MemoryShape {
    return this.data;
  }

  load(data: Partial<MemoryShape>): void {
    this.data = {
      accounts: data.accounts ?? {},
      counters: data.counters ?? {},
      credits: data.credits ?? {},
      reports: data.reports ?? {},
      audits: data.audits ?? {},
      captures: data.captures ?? {},
      captureOrder: data.captureOrder ?? [],
    };
  }

  async getAccount(id: string): Promise<AccountRecord> {
    return this.data.accounts[id] ?? { used: 0, bonus: 0, codes: [] };
  }

  async ensureUsed(id: string, used: number): Promise<AccountRecord> {
    const current = await this.getAccount(id);
    current.used = Math.max(current.used, used);
    this.data.accounts[id] = current;
    return current;
  }

  async incrementUsed(id: string): Promise<AccountRecord> {
    const current = await this.getAccount(id);
    current.used += 1;
    this.data.accounts[id] = current;
    return current;
  }

  async addBonus(id: string, code: string, amount: number): Promise<AccountRecord> {
    const current = await this.getAccount(id);
    if (!current.codes.includes(code)) {
      current.codes.push(code);
      current.bonus += amount;
    }
    this.data.accounts[id] = current;
    return current;
  }

  async getCount(key: string): Promise<number> {
    const row = this.data.counters[key];
    if (!row || row.expires <= this.now()) return 0;
    return row.value;
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const row = this.data.counters[key];
    const fresh = !row || row.expires <= this.now();
    const value = (fresh ? 0 : row.value) + 1;
    this.data.counters[key] = { value, expires: this.now() + ttlMs };
    return value;
  }

  async getCredits(day: string): Promise<number> {
    return this.data.credits[day] ?? 0;
  }

  async addCredits(day: string, amount: number): Promise<number> {
    const next = (this.data.credits[day] ?? 0) + amount;
    this.data.credits[day] = next;
    return next;
  }

  async reserveAccount(id: string, baseAllowance: number, floor = 0): Promise<{ ok: boolean; record: AccountRecord }> {
    const current = this.data.accounts[id] ?? { used: 0, bonus: 0, codes: [] };
    const result = applyAccountReserve(current, baseAllowance, floor);
    this.data.accounts[id] = result.record;
    return { ok: result.ok, record: { ...result.record, codes: [...result.record.codes] } };
  }

  async releaseAccount(id: string): Promise<AccountRecord> {
    const current = this.data.accounts[id] ?? { used: 0, bonus: 0, codes: [] };
    const next = { ...current, codes: [...current.codes], used: Math.max(0, current.used - 1) };
    this.data.accounts[id] = next;
    return { ...next, codes: [...next.codes] };
  }

  async reserveCount(key: string, ttlMs: number, limit: number): Promise<ReserveResult> {
    const row = this.data.counters[key];
    const fresh = !row || row.expires <= this.now();
    const current = fresh ? 0 : row.value;
    if (current >= limit) return { ok: false, value: current };
    const value = current + 1;
    this.data.counters[key] = { value, expires: this.now() + ttlMs };
    return { ok: true, value };
  }

  async releaseCount(key: string): Promise<number> {
    const row = this.data.counters[key];
    if (!row || row.expires <= this.now()) return 0;
    const value = Math.max(0, row.value - 1);
    this.data.counters[key] = { value, expires: row.expires };
    return value;
  }

  async reserveCredits(day: string, amount: number, cap: number): Promise<ReserveResult> {
    const current = this.data.credits[day] ?? 0;
    if (current + amount > cap) return { ok: false, value: current };
    const value = current + amount;
    this.data.credits[day] = value;
    return { ok: true, value };
  }

  async releaseCredits(day: string, amount: number): Promise<number> {
    const value = Math.max(0, (this.data.credits[day] ?? 0) - amount);
    this.data.credits[day] = value;
    return value;
  }

  async saveReport(id: string, report: unknown): Promise<void> {
    this.purgeExpired();
    this.data.reports[id] = { savedAt: this.now(), report };
  }

  async getReport<T>(id: string): Promise<T | null> {
    this.purgeExpired();
    const row = this.data.reports[id];
    const report = unwrapReport<T>(row, this.now());
    if (row && report === null) delete this.data.reports[id];
    return report;
  }

  async appendAudit(event: AuditRecord): Promise<void> {
    this.purgeExpired();
    const record = { ...event, subject: auditSubject(event.subject) };
    this.data.audits[event.caseId] = { savedAt: this.now(), record };
  }

  async saveCapture(record: CaptureRecord): Promise<void> {
    const copy = structuredClone(record);
    this.data.captures[copy.id] = copy;
    this.data.captureOrder = [copy.id, ...this.data.captureOrder.filter((id) => id !== copy.id)];
  }

  async listCaptures(): Promise<CaptureSummary[]> {
    const rows: CaptureSummary[] = [];
    for (const id of this.data.captureOrder) {
      const row = this.data.captures[id];
      if (row) rows.push(summarizeCapture(row));
    }
    return rows;
  }

  async getCapture(id: string): Promise<CaptureRecord | null> {
    const row = this.data.captures[id];
    return row ? structuredClone(row) : null;
  }

  async markPromoted(id: string, previewId: string): Promise<CaptureRecord | null> {
    const row = this.data.captures[id];
    if (!row) return null;
    row.promoted = true;
    row.previewId = previewId;
    return structuredClone(row);
  }

  async deleteCapture(id: string): Promise<boolean> {
    if (!this.data.captures[id]) return false;
    delete this.data.captures[id];
    this.data.captureOrder = this.data.captureOrder.filter((item) => item !== id);
    return true;
  }

  private purgeExpired(): boolean {
    const now = this.now();
    const maxAge = reportRetentionMs();
    let removed = false;
    for (const [id, row] of Object.entries(this.data.reports)) {
      if (row && typeof row === "object" && "savedAt" in row && now - Number((row as StoredReport).savedAt) > maxAge) {
        delete this.data.reports[id];
        removed = true;
      }
    }
    for (const [id, row] of Object.entries(this.data.audits)) {
      if (now - row.savedAt > maxAge) {
        delete this.data.audits[id];
        removed = true;
      }
    }
    return removed;
  }
}

export class FileUsageStore extends MemoryUsageStore {
  private queue: Promise<void> = Promise.resolve();
  private loaded = false;

  constructor(private readonly file: string) {
    super();
  }

  async ready(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as Partial<MemoryShape>;
      this.load(parsed);
    } catch {
      this.load({});
    }
  }

  private persist(): Promise<void> {
    this.queue = this.queue.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify(this.snapshot()));
    });
    return this.queue;
  }

  override async ensureUsed(id: string, used: number): Promise<AccountRecord> {
    const record = await super.ensureUsed(id, used);
    await this.persist();
    return record;
  }

  override async incrementUsed(id: string): Promise<AccountRecord> {
    const record = await super.incrementUsed(id);
    await this.persist();
    return record;
  }

  override async addBonus(id: string, code: string, amount: number): Promise<AccountRecord> {
    const record = await super.addBonus(id, code, amount);
    await this.persist();
    return record;
  }

  override async increment(key: string, ttlMs: number): Promise<number> {
    const value = await super.increment(key, ttlMs);
    await this.persist();
    return value;
  }

  override async addCredits(day: string, amount: number): Promise<number> {
    const value = await super.addCredits(day, amount);
    await this.persist();
    return value;
  }

  override async reserveAccount(id: string, baseAllowance: number, floor = 0): Promise<{ ok: boolean; record: AccountRecord }> {
    const result = await super.reserveAccount(id, baseAllowance, floor);
    await this.persist();
    return result;
  }

  override async releaseAccount(id: string): Promise<AccountRecord> {
    const record = await super.releaseAccount(id);
    await this.persist();
    return record;
  }

  override async reserveCount(key: string, ttlMs: number, limit: number): Promise<ReserveResult> {
    const result = await super.reserveCount(key, ttlMs, limit);
    await this.persist();
    return result;
  }

  override async releaseCount(key: string): Promise<number> {
    const value = await super.releaseCount(key);
    await this.persist();
    return value;
  }

  override async reserveCredits(day: string, amount: number, cap: number): Promise<ReserveResult> {
    const result = await super.reserveCredits(day, amount, cap);
    await this.persist();
    return result;
  }

  override async releaseCredits(day: string, amount: number): Promise<number> {
    const value = await super.releaseCredits(day, amount);
    await this.persist();
    return value;
  }

  override async appendAudit(event: AuditRecord): Promise<void> {
    await super.appendAudit(event);
    await this.persist();
  }

  override async saveReport(id: string, report: unknown): Promise<void> {
    await super.saveReport(id, report);
    await this.persist();
  }

  override async saveCapture(record: CaptureRecord): Promise<void> {
    await super.saveCapture(record);
    await this.persist();
  }

  override async markPromoted(id: string, previewId: string): Promise<CaptureRecord | null> {
    const record = await super.markPromoted(id, previewId);
    if (record) await this.persist();
    return record;
  }

  override async deleteCapture(id: string): Promise<boolean> {
    const removed = await super.deleteCapture(id);
    if (removed) await this.persist();
    return removed;
  }

  override async getReport<T>(id: string): Promise<T | null> {
    const reportsBefore = Object.keys(this.snapshot().reports).length;
    const auditsBefore = Object.keys(this.snapshot().audits).length;
    const report = await super.getReport<T>(id);
    if (Object.keys(this.snapshot().reports).length !== reportsBefore || Object.keys(this.snapshot().audits).length !== auditsBefore) {
      await this.persist();
    }
    return report;
  }
}

export class UpstashUsageStore implements UsageStore {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async command<T>(args: unknown[]): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Usage store HTTP ${res.status}`);
    const json = (await res.json()) as { result: T };
    return json.result;
  }

  private async readAccount(id: string): Promise<AccountRecord> {
    const raw = await this.command<string | null>(["GET", `acct:${id}`]);
    if (!raw) return { used: 0, bonus: 0, codes: [] };
    return JSON.parse(raw) as AccountRecord;
  }

  private async writeAccount(id: string, record: AccountRecord): Promise<AccountRecord> {
    await this.command(["SET", `acct:${id}`, JSON.stringify(record)]);
    return record;
  }

  async getAccount(id: string): Promise<AccountRecord> {
    return this.readAccount(id);
  }

  async ensureUsed(id: string, used: number): Promise<AccountRecord> {
    const current = await this.readAccount(id);
    current.used = Math.max(current.used, used);
    return this.writeAccount(id, current);
  }

  async incrementUsed(id: string): Promise<AccountRecord> {
    const current = await this.readAccount(id);
    current.used += 1;
    return this.writeAccount(id, current);
  }

  async addBonus(id: string, code: string, amount: number): Promise<AccountRecord> {
    const current = await this.readAccount(id);
    if (!current.codes.includes(code)) {
      current.codes.push(code);
      current.bonus += amount;
    }
    return this.writeAccount(id, current);
  }

  async getCount(key: string): Promise<number> {
    const value = await this.command<string | null>(["GET", `ctr:${key}`]);
    return value ? Number(value) : 0;
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const value = await this.command<number>(["INCR", `ctr:${key}`]);
    const ttlLeft = await this.command<number>(["PTTL", `ctr:${key}`]);
    if (value === 1 || ttlLeft < 0) await this.command(["PEXPIRE", `ctr:${key}`, ttlMs]);
    return value;
  }

  async getCredits(day: string): Promise<number> {
    const value = await this.command<string | null>(["GET", `credits:${day}`]);
    return value ? Number(value) : 0;
  }

  async addCredits(day: string, amount: number): Promise<number> {
    return this.command<number>(["INCRBY", `credits:${day}`, amount]);
  }

  async reserveAccount(id: string, baseAllowance: number, floor = 0): Promise<{ ok: boolean; record: AccountRecord }> {
    const raw = await this.command<string>(["EVAL", RESERVE_ACCOUNT_LUA, 1, `acct:${id}`, baseAllowance, floor]);
    const parsed = JSON.parse(raw) as { ok: boolean; used: number; bonus: number; codes: string[] };
    return { ok: Boolean(parsed.ok), record: { used: parsed.used ?? 0, bonus: parsed.bonus ?? 0, codes: parsed.codes ?? [] } };
  }

  async releaseAccount(id: string): Promise<AccountRecord> {
    const raw = await this.command<string>(["EVAL", RELEASE_ACCOUNT_LUA, 1, `acct:${id}`]);
    const parsed = JSON.parse(raw) as AccountRecord;
    return { used: parsed.used ?? 0, bonus: parsed.bonus ?? 0, codes: parsed.codes ?? [] };
  }

  async reserveCount(key: string, ttlMs: number, limit: number): Promise<ReserveResult> {
    const result = await this.command<[number, number]>(["EVAL", RESERVE_COUNT_LUA, 1, `ctr:${key}`, limit, ttlMs]);
    return { ok: Number(result[0]) === 1, value: Number(result[1]) };
  }

  async releaseCount(key: string): Promise<number> {
    const value = await this.command<number>(["DECR", `ctr:${key}`]);
    if (value < 0) {
      await this.command(["SET", `ctr:${key}`, "0"]);
      return 0;
    }
    return value;
  }

  async reserveCredits(day: string, amount: number, cap: number): Promise<ReserveResult> {
    const result = await this.command<[number, number]>(["EVAL", RESERVE_CREDITS_LUA, 1, `credits:${day}`, amount, cap]);
    return { ok: Number(result[0]) === 1, value: Number(result[1]) };
  }

  async releaseCredits(day: string, amount: number): Promise<number> {
    const value = await this.command<number>(["DECRBY", `credits:${day}`, amount]);
    if (value < 0) {
      await this.command(["SET", `credits:${day}`, "0"]);
      return 0;
    }
    return value;
  }

  async saveReport(id: string, report: unknown): Promise<void> {
    await this.command(["SET", `report:${id}`, JSON.stringify(report), "EX", retentionSeconds()]);
  }

  async appendAudit(event: AuditRecord): Promise<void> {
    const record = { ...event, subject: auditSubject(event.subject) };
    await this.command(["SET", `audit:${event.caseId}`, JSON.stringify(record), "EX", retentionSeconds()]);
  }

  async getReport<T>(id: string): Promise<T | null> {
    const raw = await this.command<string | null>(["GET", `report:${id}`]);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async saveCapture(record: CaptureRecord): Promise<void> {
    await this.command(["SET", `capture:${record.id}`, JSON.stringify(record)]);
    await this.command(["LREM", "captures:index", 0, record.id]);
    await this.command(["LPUSH", "captures:index", record.id]);
  }

  async listCaptures(): Promise<CaptureSummary[]> {
    const ids = (await this.command<string[] | null>(["LRANGE", "captures:index", 0, 199])) ?? [];
    const seen = new Set<string>();
    const rows: CaptureSummary[] = [];
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const capture = await this.getCapture(id);
      if (capture) rows.push(summarizeCapture(capture));
    }
    return rows;
  }

  async getCapture(id: string): Promise<CaptureRecord | null> {
    const raw = await this.command<string | null>(["GET", `capture:${id}`]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CaptureRecord;
    } catch {
      return null;
    }
  }

  async markPromoted(id: string, previewId: string): Promise<CaptureRecord | null> {
    const capture = await this.getCapture(id);
    if (!capture) return null;
    capture.promoted = true;
    capture.previewId = previewId;
    await this.command(["SET", `capture:${id}`, JSON.stringify(capture)]);
    return capture;
  }

  async deleteCapture(id: string): Promise<boolean> {
    const capture = await this.getCapture(id);
    if (!capture) return false;
    await this.command(["DEL", `capture:${id}`]);
    await this.command(["LREM", "captures:index", 0, id]);
    return true;
  }
}

type StoreSlot = { store: UsageStore | null; ready: Promise<void> };

const storeGlobal = globalThis as typeof globalThis & { __scamScoutUsage?: StoreSlot };

function slot(): StoreSlot {
  if (!storeGlobal.__scamScoutUsage) storeGlobal.__scamScoutUsage = { store: null, ready: Promise.resolve() };
  return storeGlobal.__scamScoutUsage;
}

export function getUsageStore(): UsageStore {
  const current = slot();
  if (current.store) return current.store;
  const env = runtimeEnv();
  const url = env["UPSTASH_REDIS_REST_URL"];
  const token = env["UPSTASH_REDIS_REST_TOKEN"];
  if (url && token) {
    current.store = new UpstashUsageStore(url, token);
    current.ready = Promise.resolve();
    return current.store;
  }
  // Hosted instances do not share a file, so per-instance counters would multiply every limit there.
  if (env["VERCEL"]) throw new Error("shared_store_unconfigured");
  const file = env["USAGE_DATA_FILE"] || path.join(process.cwd(), "data", "usage.json");
  const store = new FileUsageStore(file);
  current.store = store;
  current.ready = store.ready();
  return store;
}

export async function readyUsageStore(): Promise<UsageStore> {
  const store = getUsageStore();
  await slot().ready;
  return store;
}

export function setUsageStore(store: UsageStore | null): void {
  const current = slot();
  current.store = store;
  current.ready = Promise.resolve();
}
