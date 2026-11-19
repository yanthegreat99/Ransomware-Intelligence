import { db } from "./db.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const countries = require("i18n-iso-countries");
const enLocale = require("../node_modules/i18n-iso-countries/langs/en.json");

countries.registerLocale(enLocale);

const aliases = {
  usa:"US","u s":"US","united states":"US","united states of america":"US",america:"US",
  uk:"GB","u k":"GB",britain:"GB","great britain":"GB","united kingdom":"GB",
  uae:"AE","united arab emirates":"AE",russia:"RU","russian federation":"RU",
  korea:"KR","south korea":"KR","republic of korea":"KR","north korea":"KP",
  taiwan:"TW","czech republic":"CZ",czechia:"CZ","ivory coast":"CI","cote divoire":"CI",
  macedonia:"MK","north macedonia":"MK","vietnam":"VN","viet nam":"VN",
  bolivia:"BO","venezuela":"VE","tanzania":"TZ","moldova":"MD","iran":"IR","syria":"SY",
  laos:"LA",brunei:"BN","brunei darussalam":"BN",palestine:"PS","hong kong":"HK",
};

function normalize(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  let alpha2;
  if (/^[A-Z]{2}$/.test(upper) && countries.getName(upper, "en")) alpha2 = upper;
  else if (/^[A-Z]{3}$/.test(upper)) alpha2 = countries.alpha3ToAlpha2(upper);
  if (!alpha2) {
    const key = trimmed.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[()[\],.]/g," ").replace(/\s+/g," ").trim();
    alpha2 = aliases[key];
  }
  if (!alpha2) alpha2 = countries.getAlpha2Code(trimmed, "en");
  if (!alpha2) return null;
  const name = countries.getName(alpha2, "en");
  const alpha3 = countries.alpha2ToAlpha3(alpha2);
  return name && alpha3 ? { name, alpha2, alpha3 } : null;
}

try {
  const victims = await db.orm.public.CanonicalVictim.select("id", "country", "countryCode").all();
  let corrected = 0;
  let unknown = 0;
  for (const victim of victims) {
    const normalized = normalize(victim.countryCode ?? victim.country);
    if (!normalized) {
      unknown++;
      continue;
    }
    if (victim.country !== normalized.name || victim.countryCode !== normalized.alpha2) {
      await db.orm.public.CanonicalVictim.where({ id: victim.id })
        .update({ country: normalized.name, countryCode: normalized.alpha2 });
      corrected++;
    }
  }
  console.log(JSON.stringify({ total:victims.length, corrected, unknown }));
} finally {
  await db.close();
}
