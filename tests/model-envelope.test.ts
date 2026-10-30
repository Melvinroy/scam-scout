import { afterEach, expect, it, vi } from "vitest";
import { meterLlm } from "@/lib/safety/spend-meter";
import { nebiusCallUsd, nebiusReserveUsd, resetSpendState, UpstashSpendLedger } from "@/lib/safety/spend";
import { evalLua } from "./helpers/redis-lua";

afterEach(resetSpendState);
it("refuses every unpriced model before reservation or network", async () => {
  const reserve = vi.fn(async () => ({ ok: false, reason: "spend_limit" as const }));
  const complete = vi.fn();
  const llm = meterLlm({ live: true, complete }, { reserve, read: vi.fn(), settle: vi.fn(), close: vi.fn() });
  for (const model of ["unlisted/most-expensive", "toString", "__proto__"]) {
    expect((await llm.complete({ task: "memo", model, system: "s", user: "u", maxTokens: 10, temperature: 0 })).error).toBe("model_unpriced");
    expect(() => nebiusCallUsd(model, { in: 1, out: 1 })).toThrow("model_unpriced");
    expect(() => nebiusReserveUsd(model, 10, 100)).toThrow("model_unpriced");
  }
  expect(reserve).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});
it("refuses a close occurring after pre-check but before atomic reservation", async () => {
  const store = new Map<string, string>([["spend:migrated:lifetime", "1"]]);
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const args = JSON.parse(String(init?.body));
    if (args[0] === "GET") {
      const result = store.get(args[1]) ?? null;
      if (args[1] === "spend:closed") store.set("spend:closed", "1");
      return Response.json({ result });
    }
    const n = Number(args[2]);
    return Response.json({ result: evalLua(store, args[1], args.slice(3, 3 + n), args.slice(3 + n)) });
  });
  const ledger = new UpstashSpendLedger("https://store.example", "test", fetchImpl as typeof fetch);
  expect(await ledger.reserve({ usd: 0.1, tavilyCredits: 1 }, { usd: 1, tavilyCredits: 10 })).toEqual({ ok: false, reason: "spend_unreadable" });
  expect(store.has("spend:usd")).toBe(false);
});

it("uses the selected model's own tariff for the reservation", () => {
  expect(nebiusReserveUsd("nvidia/Nemotron-3_5-Lightning", 100, 1000)).toBeCloseTo(0.000084, 12);
  expect(nebiusReserveUsd("nvidia/Nemotron-3-Ultra-550b-a55b", 100, 1000)).toBeCloseTo(0.0013, 12);
});

it("refuses images on priced text models before reservation or network", async () => {
  const { TOKEN_PRICES } = await import("@/lib/config");
  const reserve = vi.fn(async () => ({ ok: false, reason: "spend_limit" as const }));
  const complete = vi.fn();
  const llm = meterLlm({ live: true, complete }, { reserve, read: vi.fn(), settle: vi.fn(), close: vi.fn() });
  const bytes = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(bytes);
  bytes.writeUInt32BE(100, 16); bytes.writeUInt32BE(100, 20);
  for (const model of Object.keys(TOKEN_PRICES).filter((id) => !id.endsWith("-VL"))) {
    expect((await llm.complete({ task: "vision", model, system: "s", user: "u", maxTokens: 10, temperature: 0, imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}` })).error).toBe("spend_limit");
  }
  expect(reserve).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

it("bounds independent NVIDIA processor image-token fixtures for every accepted model", async () => {
  const { imageTokenBound } = await import("@/lib/safety/image-bound");
  const { TOKEN_PRICES } = await import("@/lib/config");
  // NVIDIA image processor revision 29dc69d: small squares upscale to a 32x32
  // grid; 1200 squares round to 76x76. Pixel shuffle divides each grid by 4.
  // Source: https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-BF16/blob/29dc69d/image_processing_nemotron_h_omni.py
  const fixtures = [{ width: 16, height: 16, billed: 256 }, { width: 1200, height: 1200, billed: 1444 }];
  const accepted: string[] = [];
  for (const model of Object.keys(TOKEN_PRICES)) for (const fixture of fixtures) {
    const bytes = Buffer.alloc(33);
    Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(bytes);
    bytes.writeUInt32BE(fixture.width, 16); bytes.writeUInt32BE(fixture.height, 20);
    const bound = imageTokenBound(`data:image/png;base64,${bytes.toString("base64")}`, model);
    if (bound !== null) {
      accepted.push(model);
      expect(bound).toBeGreaterThanOrEqual(fixture.billed + 4);
    }
  }
  expect([...new Set(accepted)]).toEqual(["nvidia/Nemotron-3.5-Super-VL"]);
});
