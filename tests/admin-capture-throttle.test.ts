import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/captures/owner", () => ({ allowlistedEmail: vi.fn() }));
vi.mock("@/lib/http/throttle", () => ({ throttleIp: vi.fn(), throttleHourly: vi.fn() }));
vi.mock("@/lib/abuse/store", () => ({ readyUsageStore: vi.fn() }));
import { allowlistedEmail } from "@/lib/captures/owner";
import { throttleIp, throttleHourly } from "@/lib/http/throttle";
import { readyUsageStore } from "@/lib/abuse/store";
import { GET } from "@/app/api/admin/captures/[id]/route";
import { POST as remove } from "@/app/api/admin/captures/[id]/delete/route";
import { POST as promote } from "@/app/api/admin/captures/[id]/promote/route";

beforeEach(() => vi.resetAllMocks());
for (const [name, handler] of [["download", GET], ["delete", remove], ["promote", promote]] as const) {
  it(`throttles ${name} before authentication or capture access`, async () => {
    const request = new Request("https://example.com/api/admin/captures/test");
    const blocked = new Response(null, { status: 429 });
    vi.mocked(throttleIp).mockResolvedValue(blocked);
    expect(await handler(request, { params: Promise.resolve({ id: "test" }) })).toBe(blocked);
    expect(throttleIp).toHaveBeenCalledWith(request, "admin", 120);
    expect(allowlistedEmail).not.toHaveBeenCalled();
    expect(readyUsageStore).not.toHaveBeenCalled();
  });
  if (name !== "download") it(`retains the owner throttle for ${name}`, async () => {
    vi.mocked(throttleIp).mockResolvedValue(null);
    vi.mocked(allowlistedEmail).mockResolvedValue("owner@example.com");
    vi.mocked(throttleHourly).mockResolvedValue(new Response(null, { status: 429 }));
    const request = new Request("https://example.com/api/admin/captures/test", { method: "POST", headers: { origin: "https://example.com" } });
    expect((await handler(request, { params: Promise.resolve({ id: "test" }) })).status).toBe(429);
    expect(throttleHourly).toHaveBeenCalledWith("admin", ["user:owner@example.com"], 60);
    expect(throttleIp).toHaveBeenCalledBefore(vi.mocked(allowlistedEmail));
  });
}
