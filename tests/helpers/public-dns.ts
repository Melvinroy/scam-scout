import { vi } from "vitest";

// Provider tests mock HTTP; resolve a fixed public address so they also run offline.
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));
