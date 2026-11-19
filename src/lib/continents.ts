const africa = new Set("DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW".split(" "));
const asia = new Set("AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE".split(" "));
const europe = new Set("AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA".split(" "));
const northAmerica = new Set("AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US".split(" "));
const southAmerica = new Set("AR BO BR CL CO EC GY PY PE SR UY VE".split(" "));
const oceania = new Set("AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU".split(" "));
const antarctica = new Set(["AQ","BV","TF","HM","GS"]);

export function continentForCountry(code?:string|null): string | null {
  if (!code) return null;
  const alpha2=code.trim().toUpperCase();
  if (africa.has(alpha2)) return "Africa";
  if (asia.has(alpha2)) return "Asia";
  if (europe.has(alpha2)) return "Europe";
  if (northAmerica.has(alpha2)) return "North America";
  if (southAmerica.has(alpha2)) return "South America";
  if (oceania.has(alpha2)) return "Oceania";
  if (antarctica.has(alpha2)) return "Antarctica";
  return null;
}
