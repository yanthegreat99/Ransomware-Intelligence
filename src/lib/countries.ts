import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const countries = require("i18n-iso-countries") as {
  alpha2ToAlpha3: (code: string) => string | undefined;
  alpha3ToAlpha2: (code: string) => string | undefined;
  getAlpha2Code: (name: string, lang: string) => string | undefined;
  getName: (code: string, lang: string) => string | undefined;
  registerLocale: (locale: unknown) => void;
};
const enLocale = require("i18n-iso-countries/langs/en.json") as unknown;
countries.registerLocale(enLocale);

export type NormalizedCountry = {
  name: string;
  alpha2: string;
  alpha3: string;
};

const aliases: Record<string, string> = {
  usa: "US",
  "u s": "US",
  "united states": "US",
  "united states of america": "US",
  america: "US",
  uk: "GB",
  "u k": "GB",
  britain: "GB",
  "great britain": "GB",
  "united kingdom": "GB",
  "united kingdom of great britain and northern ireland": "GB",
  uae: "AE",
  "united arab emirates": "AE",
  russia: "RU",
  "russian federation": "RU",
  korea: "KR",
  "south korea": "KR",
  "republic of korea": "KR",
  "north korea": "KP",
  "democratic people's republic of korea": "KP",
  taiwan: "TW",
  "taiwan province of china": "TW",
  "czech republic": "CZ",
  czechia: "CZ",
  "ivory coast": "CI",
  "cote divoire": "CI",
  "cape verde": "CV",
  "caboverde": "CV",
  macedonia: "MK",
  "north macedonia": "MK",
  vietnam: "VN",
  "viet nam": "VN",
  bolivia: "BO",
  "bolivia plurinational state of": "BO",
  venezuela: "VE",
  "venezuela bolivarian republic of": "VE",
  tanzania: "TZ",
  "united republic of tanzania": "TZ",
  moldova: "MD",
  "republic of moldova": "MD",
  iran: "IR",
  "iran islamic republic of": "IR",
  syria: "SY",
  "syrian arab republic": "SY",
  laos: "LA",
  "lao people's democratic republic": "LA",
  brunei: "BN",
  "brunei darussalam": "BN",
  palestine: "PS",
  "state of palestine": "PS",
  congo: "CG",
  "republic of the congo": "CG",
  "democratic republic of congo": "CD",
  "democratic republic of the congo": "CD",
  drc: "CD",
  hongkong: "HK",
  "hong kong": "HK",
};

function cleanCountryName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()[\],.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCountry(value?: string | null): NormalizedCountry | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  let alpha2: string | undefined;
  if (/^[A-Z]{2}$/.test(upper) && countries.getName(upper, "en")) alpha2 = upper;
  else if (/^[A-Z]{3}$/.test(upper)) alpha2 = countries.alpha3ToAlpha2(upper);

  if (!alpha2) {
    const key = cleanCountryName(trimmed);
    alpha2 = aliases[key];
  }
  if (!alpha2) alpha2 = countries.getAlpha2Code(trimmed, "en");

  if (!alpha2) return null;
  const name = countries.getName(alpha2, "en");
  if (!name) return null;
  const alpha3 = countries.alpha2ToAlpha3(alpha2);
  return alpha3 ? { name, alpha2, alpha3 } : null;
}

export function countryName(value?: string | null): string | undefined {
  return normalizeCountry(value)?.name;
}

export function countryCode(value?: string | null): string | undefined {
  return normalizeCountry(value)?.alpha2;
}
