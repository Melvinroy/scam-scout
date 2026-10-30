import type { SignalCategory, TypologyId } from "@/lib/types";

export interface SignalDef {
  id: string;
  title: string;
  weight: number;
  hard: boolean;
  category: SignalCategory;
  typologies: TypologyId[];
}

export const SIGNAL_DEFS: Record<string, SignalDef> = {
  R1: {
    id: "R1",
    title: "Exact match on a regulator warning or alert list",
    weight: 75,
    hard: true,
    category: "other",
    typologies: ["investment_scam"],
  },
  R2: {
    id: "R2",
    title: "Fuzzy match on a regulator warning list",
    weight: 20,
    hard: false,
    category: "other",
    typologies: ["investment_scam"],
  },
  R3: {
    id: "R3",
    title: "Independent reports quote a regulator warning for the exact name",
    weight: 60,
    hard: true,
    category: "other",
    typologies: ["investment_scam", "impersonation"],
  },
  C1: {
    id: "C1",
    title: "Two or more independent victim or complaint reports",
    weight: 30,
    hard: false,
    category: "complaints",
    typologies: ["fake_shop", "investment_scam", "app_mule"],
  },
  C2: {
    id: "C2",
    title: "A single complaint report",
    weight: 12,
    hard: false,
    category: "complaints",
    typologies: ["fake_shop", "app_mule"],
  },
  C3: {
    id: "C3",
    title: "News or police advisory links the entity to a scam",
    weight: 20,
    hard: false,
    category: "complaints",
    typologies: ["investment_scam", "impersonation"],
  },
  P1: {
    id: "P1",
    title: "Phone number appears in scam reports",
    weight: 20,
    hard: false,
    category: "complaints",
    typologies: ["app_mule"],
  },
  D1: {
    id: "D1",
    title: "Domain is young",
    weight: 15,
    hard: false,
    category: "other",
    typologies: ["fake_shop", "investment_scam", "impersonation"],
  },
  S1: {
    id: "S1",
    title: "Missing terms, privacy, refund or contact pages",
    weight: 10,
    hard: false,
    category: "site",
    typologies: ["fake_shop"],
  },
  S2: {
    id: "S2",
    title: "Refund policy absent or unworkable",
    weight: 10,
    hard: false,
    category: "site",
    typologies: ["fake_shop"],
  },
  S3: {
    id: "S3",
    title: "Contact only via messenger or a free email, with no address",
    weight: 10,
    hard: false,
    category: "site",
    typologies: ["fake_shop"],
  },
  S4: {
    id: "S4",
    title: "Licence or registration claim could not be verified",
    weight: 25,
    hard: false,
    category: "other",
    typologies: ["investment_scam"],
  },
  S5: {
    id: "S5",
    title: "Same template appears on unrelated domains",
    weight: 15,
    hard: false,
    category: "other",
    typologies: ["fake_shop"],
  },
  S6: {
    id: "S6",
    title: "Lookalike or homoglyph of a known brand domain",
    weight: 20,
    hard: false,
    category: "other",
    typologies: ["impersonation"],
  },
  V1: {
    id: "V1",
    title: "Bank or government branding on a non-official domain",
    weight: 35,
    hard: true,
    category: "other",
    typologies: ["impersonation"],
  },
  V2: {
    id: "V2",
    title: "Stock-photo storefront or mismatched imagery",
    weight: 8,
    hard: false,
    category: "other",
    typologies: ["fake_shop"],
  },
  V3: {
    id: "V3",
    title: "Fake trust badges or regulator seals",
    weight: 12,
    hard: false,
    category: "other",
    typologies: ["investment_scam"],
  },
  I1: {
    id: "I1",
    title: "Guaranteed or unrealistic returns",
    weight: 25,
    hard: false,
    category: "other",
    typologies: ["investment_scam"],
  },
  I2: {
    id: "I2",
    title: "Pressure tactics or off-platform payment instructions",
    weight: 15,
    hard: false,
    category: "other",
    typologies: ["investment_scam", "app_mule"],
  },
  A1: {
    id: "A1",
    title: "Personal payee presented as a merchant",
    weight: 15,
    hard: false,
    category: "other",
    typologies: ["app_mule"],
  },
  X1: {
    id: "X1",
    title: "Page text contains prompt-injection instructions",
    weight: 8,
    hard: false,
    category: "other",
    typologies: [],
  },
  M1: {
    id: "M1",
    title: "Listed in an official licence register under the same domain",
    weight: -30,
    hard: false,
    category: "mitigation",
    typologies: [],
  },
  M2: {
    id: "M2",
    title: "Domain older than five years with consistent independent reviews",
    weight: -15,
    hard: false,
    category: "mitigation",
    typologies: [],
  },
  M3: {
    id: "M3",
    title: "Business registration number verified",
    weight: -10,
    hard: false,
    category: "mitigation",
    typologies: [],
  },
  M4: {
    id: "M4",
    title: "Official domain of a known brand",
    weight: -40,
    hard: false,
    category: "mitigation",
    typologies: [],
  },
};

export const CATEGORY_CAPS: Partial<Record<SignalCategory, number>> = {
  complaints: 35,
  site: 25,
};

export interface TypologyAxis {
  id: TypologyId;
  label: string;
  primary: string[];
  supporting: string[];
}

export const TYPOLOGIES: TypologyAxis[] = [
  {
    id: "investment_scam",
    label: "Investment scam",
    primary: ["R1", "I1", "S4"],
    supporting: ["C1", "C3", "V3", "D1", "I2"],
  },
  {
    id: "fake_shop",
    label: "Fake shop",
    primary: ["S2", "S3", "S5", "V2"],
    supporting: ["D1", "C1", "C2", "S1"],
  },
  {
    id: "impersonation",
    label: "Impersonation",
    primary: ["V1", "S6"],
    supporting: ["R1", "C3", "D1"],
  },
  {
    id: "app_mule",
    label: "APP / mule payee",
    primary: ["P1", "A1", "C1"],
    supporting: ["C2", "I2"],
  },
];

export const RELIABILITY: Record<string, number> = {
  regulator: 1,
  own_site: 1,
  rdap: 1,
  news: 0.9,
  vision: 0.8,
  forum: 0.7,
  review: 0.7,
  unknown: 0.5,
  code: 1,
};
