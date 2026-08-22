const CONTRACT = "AVANTIQO_FONT_LIBRARY_V1";
const UPSTREAM_REPOSITORY = "google/fonts";
const UPSTREAM_REVISION = "ec626514f79f831f1ab848a82114a0ce7e2d6372";
const LICENSE_ID = "OFL-1.1";

function family({
  id,
  name,
  category,
  scripts = ["latin"],
  roles = [],
  directory = id,
  priority = 100,
}) {
  return Object.freeze({
    id: `platform-font:${id}`,
    slug: id,
    family: name,
    category,
    scripts: Object.freeze([...scripts]),
    roles: Object.freeze([...roles]),
    priority,
    source: Object.freeze({
      repository: UPSTREAM_REPOSITORY,
      revision: UPSTREAM_REVISION,
      directory: `ofl/${directory}`,
      license_path: `ofl/${directory}/OFL.txt`,
      license_id: LICENSE_ID,
      immutable_revision: true,
    }),
    license: Object.freeze({
      id: LICENSE_ID,
      verified: true,
      redistribution_allowed: true,
      commercial_use_allowed: true,
      modification_allowed_under_license: true,
    }),
  });
}

export const AVANTIQO_FONT_LIBRARY = Object.freeze([
  family({ id: "inter", name: "Inter", category: "SANS", roles: ["UI", "CORPORATE", "EDITORIAL"] , priority: 10 }),
  family({ id: "opensans", name: "Open Sans", category: "SANS", roles: ["CORPORATE", "DOCUMENT", "WEB"], priority: 20 }),
  family({ id: "montserrat", name: "Montserrat", category: "SANS", roles: ["BRAND", "POSTER", "SOCIAL"], priority: 30 }),
  family({ id: "poppins", name: "Poppins", category: "SANS", roles: ["BRAND", "SOCIAL", "DISPLAY"], priority: 40 }),
  family({ id: "lato", name: "Lato", category: "SANS", roles: ["CORPORATE", "DOCUMENT", "MENU"], priority: 50 }),
  family({ id: "nunitosans", name: "Nunito Sans", category: "SANS", roles: ["FRIENDLY", "SOCIAL", "DOCUMENT"], priority: 60 }),
  family({ id: "manrope", name: "Manrope", category: "SANS", roles: ["PREMIUM", "TECH", "BRAND"], priority: 70 }),
  family({ id: "dmsans", name: "DM Sans", category: "SANS", roles: ["MODERN", "BRAND", "SOCIAL"], priority: 80 }),
  family({ id: "worksans", name: "Work Sans", category: "SANS", roles: ["CORPORATE", "DOCUMENT", "SIGNAGE"], priority: 90 }),
  family({ id: "sourcesans3", name: "Source Sans 3", category: "SANS", roles: ["DOCUMENT", "CORPORATE", "ACCESSIBLE"], priority: 100 }),
  family({ id: "raleway", name: "Raleway", category: "SANS", roles: ["LUXURY", "BRAND", "DISPLAY"], priority: 110 }),
  family({ id: "rubik", name: "Rubik", category: "SANS", roles: ["MODERN", "SOCIAL", "SIGNAGE"], priority: 120 }),
  family({ id: "outfit", name: "Outfit", category: "SANS", roles: ["MODERN", "LUXURY", "SOCIAL"], priority: 130 }),
  family({ id: "spacegrotesk", name: "Space Grotesk", category: "SANS", roles: ["TECH", "EDITORIAL", "DISPLAY"], priority: 140 }),
  family({ id: "barlow", name: "Barlow", category: "SANS", roles: ["CORPORATE", "SPORT", "SIGNAGE"], priority: 150 }),

  family({ id: "playfairdisplay", name: "Playfair Display", category: "SERIF", roles: ["LUXURY", "EDITORIAL", "HOSPITALITY"], priority: 200 }),
  family({ id: "merriweather", name: "Merriweather", category: "SERIF", roles: ["EDITORIAL", "DOCUMENT", "LONGFORM"], priority: 210 }),
  family({ id: "librebaskerville", name: "Libre Baskerville", category: "SERIF", roles: ["CLASSIC", "EDITORIAL", "MENU"], priority: 220 }),
  family({ id: "cormorantgaramond", name: "Cormorant Garamond", category: "SERIF", roles: ["LUXURY", "FASHION", "HOSPITALITY"], priority: 230 }),
  family({ id: "sourceserif4", name: "Source Serif 4", category: "SERIF", roles: ["DOCUMENT", "EDITORIAL", "REPORT"], priority: 240 }),
  family({ id: "lora", name: "Lora", category: "SERIF", roles: ["EDITORIAL", "HOSPITALITY", "LONGFORM"], priority: 250 }),

  family({ id: "bebasneue", name: "Bebas Neue", category: "DISPLAY", roles: ["POSTER", "EVENT", "SIGNAGE"], priority: 300 }),
  family({ id: "oswald", name: "Oswald", category: "DISPLAY", roles: ["POSTER", "SPORT", "SIGNAGE"], priority: 310 }),
  family({ id: "anton", name: "Anton", category: "DISPLAY", roles: ["POSTER", "SOCIAL", "HEADLINE"], priority: 320 }),
  family({ id: "leaguespartan", name: "League Spartan", category: "DISPLAY", roles: ["BRAND", "POSTER", "HEADLINE"], priority: 330 }),

  family({ id: "jetbrainsmono", name: "JetBrains Mono", category: "MONO", roles: ["TECH", "CODE", "DATA"], priority: 400 }),
  family({ id: "sourcecodepro", name: "Source Code Pro", category: "MONO", roles: ["TECH", "CODE", "DATA"], priority: 410 }),

  family({ id: "sarabun", name: "Sarabun", category: "THAI_SANS", scripts: ["thai", "latin"], roles: ["THAI", "DOCUMENT", "CORPORATE"], priority: 500 }),
  family({ id: "kanit", name: "Kanit", category: "THAI_SANS", scripts: ["thai", "latin"], roles: ["THAI", "POSTER", "SOCIAL"], priority: 510 }),
  family({ id: "prompt", name: "Prompt", category: "THAI_SANS", scripts: ["thai", "latin"], roles: ["THAI", "BRAND", "MENU"], priority: 520 }),
  family({ id: "notosansthai", name: "Noto Sans Thai", category: "THAI_SANS", scripts: ["thai", "latin"], roles: ["THAI", "DOCUMENT", "ACCESSIBLE"], priority: 530 }),
  family({ id: "notoserifthai", name: "Noto Serif Thai", category: "THAI_SERIF", scripts: ["thai", "latin"], roles: ["THAI", "EDITORIAL", "LUXURY"], priority: 540 }),
]);

if (AVANTIQO_FONT_LIBRARY.length !== 32) {
  throw new Error(`AVANTIQO_FONT_LIBRARY_COUNT_INVALID:${AVANTIQO_FONT_LIBRARY.length}`);
}

const BY_ID = new Map(AVANTIQO_FONT_LIBRARY.map((entry) => [entry.id, entry]));
const BY_SLUG = new Map(AVANTIQO_FONT_LIBRARY.map((entry) => [entry.slug, entry]));
const BY_FAMILY = new Map(
  AVANTIQO_FONT_LIBRARY.map((entry) => [entry.family.toLowerCase(), entry]),
);

export function getAvantiqoFont(value) {
  const key = String(value ?? "").trim();
  if (!key) return null;
  return BY_ID.get(key) || BY_SLUG.get(key) || BY_FAMILY.get(key.toLowerCase()) || null;
}

export function listAvantiqoFonts({ script = null, category = null, role = null } = {}) {
  const wantedScript = String(script ?? "").trim().toLowerCase();
  const wantedCategory = String(category ?? "").trim().toUpperCase();
  const wantedRole = String(role ?? "").trim().toUpperCase();
  return AVANTIQO_FONT_LIBRARY.filter((entry) => {
    if (wantedScript && !entry.scripts.includes(wantedScript)) return false;
    if (wantedCategory && entry.category !== wantedCategory) return false;
    if (wantedRole && !entry.roles.includes(wantedRole)) return false;
    return true;
  });
}

export const CreativeFontLibraryRegistry = Object.freeze({
  contract: CONTRACT,
  upstream_repository: UPSTREAM_REPOSITORY,
  upstream_revision: UPSTREAM_REVISION,
  license_id: LICENSE_ID,
  family_count: AVANTIQO_FONT_LIBRARY.length,
  families: AVANTIQO_FONT_LIBRARY,
  get: getAvantiqoFont,
  list: listAvantiqoFonts,
});

export default CreativeFontLibraryRegistry;
