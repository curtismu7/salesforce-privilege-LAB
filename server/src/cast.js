// {{token}} templating for the story, the scripted scenarios and the seeded mock org. Tokens are filled from one of three vertical packs
// (finance, health, retail). A test fails on any token a pack does not define. Every person, org, permission set and host in a pack is
// synthetic: people have an email on the org's own .example host, the mock org lives on a .example host, no real company, tenant or account.
// customer.config.json (optional, git-ignored) may override only the brand.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { scanHosts } from './safety.js';

const TOKEN = /\{\{(\w+)\}\}/g;
const MAX_CAST = 40;

// The shape every pack fills. Emails are the Privilege and Salesforce match key, so they are written whole (never composed from parts).
const pack = (o) => {
  // Every fictional person has an email on the org's own .example host, built from the local part. Never composed from real names or domains.
  const em = (local) => `${local}@${o.org}.example`;
  const un = (local) => `${local}@${o.org}-dev-ed.example`;
  return {
    // the one Salesforce org
    castBrand: o.brand, castOrg: o.org, castOrgHost: `${o.org}-dev-ed.develop.my.salesforce.example`, castLoginUrl: `https://${o.org}-dev-ed.develop.my.salesforce.example`,
    castAppName: `${o.brand} Salesforce`, castEccName: `${o.brand} Privilege`,
    // the org admin: the user Privilege signs in as (a Salesforce-licensed System Administrator)
    castAdminName: o.admin[0], castAdminEmail: em(o.admin[1]), castAdminUsername: un(o.admin[1]),
    // A: the support engineer: a person whose email is unique in Privilege, who has a Salesforce user on the Minimum Access profile
    castAName: o.a[0], castAEmail: em(o.a[1]), castAUsername: un(o.a[1]),
    // D1 and D2: two Privilege records that share ONE email on purpose (only D1 has a Salesforce user)
    castDupName1: o.d1[0], castDupName2: o.d2[0], castDupEmail: em(o.d1[1]), castDupUsername: un(o.d1[1]),
    // C: unique email, no Salesforce user yet (waits until an admin creates one)
    castCName: o.c[0], castCEmail: em(o.c[1]), castCUsername: un(o.c[1]),
    // F: unique email; the Salesforce user has a Federation ID but a DIFFERENT email, so it never links by email
    castFName: o.f[0], castFEmail: em(o.f[1]), castFSfEmail: em(o.f[2]), castFUsername: un(o.f[2]), castFFederationId: em(o.f[1]),
    // a Salesforce username already used by another org (usernames are unique across all orgs)
    castTakenUsername: `${o.a[1]}@${o.org}-other-org.example`,
    // permission sets
    castPermSet: 'Case Read Access', castPermSet2: 'Account Read Access', castIntegrationSet: 'Integration Access',
    castLicensedSet: o.licensedSet, castOtherLicense: 'Chatter Free', castOtherLicenseSet: o.otherSet,
    // the three cases the engineer works (fictional titles and accounts; the P1 is the first)
    castCaseP1Title: o.cases[0][0], castCaseP1Account: o.cases[0][1], castCase2Title: o.cases[1][0], castCase2Account: o.cases[1][1], castCase3Title: o.cases[2][0], castCase3Account: o.cases[2][1],
    castConsumerKey: `3MVG9-MOCK-${o.org}-0001`, castKeyCode: String(100000 + (parseInt(createHash('sha256').update(`${o.org}|code`).digest('hex').slice(0, 8), 16) % 900000)),
    castWizardUrl: `https://${o.org}-dev-ed.develop.lightning.force.example/lightning/page/home`,
  };
};

export const VERTICALS = {
  finance: pack({
    brand: 'Fabrikam Bank', org: 'fabrikam', admin: ['Maya Chen', 'maya.chen'], a: ['Omar Reyes', 'omar.reyes'],
    d1: ['Priya Nair', 'priya.nair'], d2: ['Priya Nair (contractor)', 'priya.nair'], c: ['Lee Park', 'lee.park'],
    f: ['Ana Silva', 'ana.silva', 'ana.silva.sf'], cases: [['Wire transfers are rejected for the corporate desk', 'Alder Logistics'], ['Month-end statement export times out', 'Birch Capital'], ['Update the branch hours shown in the customer portal', 'Cedar Credit Union']], licensedSet: 'Sales Cloud Einstein', otherSet: 'Community Moderator',
  }),
  health: pack({
    brand: 'Contoso Health', org: 'contoso', admin: ['Lena Ortiz', 'lena.ortiz'], a: ['Tariq Hassan', 'tariq.hassan'],
    d1: ['Grace Liu', 'grace.liu'], d2: ['Grace Liu (locum)', 'grace.liu'], c: ['Noah Becker', 'noah.becker'],
    f: ['Maria Costa', 'maria.costa', 'maria.costa.sf'], cases: [['Clinic staff cannot sign in to the patient portal', 'Riverside Clinic'], ['Appointment reminders arrive twice', 'Harbor Pediatrics'], ['Correct the footer text on lab result letters', 'Summit Imaging']], licensedSet: 'Health Cloud Analytics', otherSet: 'Community Moderator',
  }),
  retail: pack({
    brand: 'Northwind Retail', org: 'northwind', admin: ['Diego Ruiz', 'diego.ruiz'], a: ['Hana Sato', 'hana.sato'],
    d1: ['Olu Adeyemi', 'olu.adeyemi'], d2: ['Olu Adeyemi (seasonal)', 'olu.adeyemi'], c: ['Mia Kowalski', 'mia.kowalski'],
    f: ['Raj Patel', 'raj.patel', 'raj.patel.sf'], cases: [['Every gift card is declined at the flagship checkout', 'Flagship Store 12'], ['Order status page shows yesterday\'s data', 'Online Orders'], ['Add a size chart to the returns email', 'Returns Team']], licensedSet: 'Retail Analytics Plus', otherSet: 'Community Moderator',
  }),
};
export const DEFAULT_VERTICAL = 'finance';
export const DEFAULT_CAST = VERTICALS[DEFAULT_VERTICAL];

export const unfilled = (text, cast) => [...String(text).matchAll(TOKEN)].map((m) => m[1]).filter((k) => !Object.hasOwn(cast, k));
export const fill = (text, cast) => String(text).replace(TOKEN, (m, k) => (Object.hasOwn(cast, k) ? cast[k] : m));
// Iterative, so a deep structure cannot overflow the stack.
export function fillDeep(value, cast) {
  const clone = (x) => (Array.isArray(x) ? [] : x && typeof x === 'object' ? {} : x);
  const outRoot = { v: clone(value) };
  const work = [[value, outRoot, 'v']];
  while (work.length) {
    const [src, dst, key] = work.pop();
    if (typeof src === 'string') { dst[key] = fill(src, cast); continue; }
    if (src === null || typeof src !== 'object') { dst[key] = src; continue; }
    const copy = clone(src);
    dst[key] = copy;
    for (const k of Object.keys(src).reverse()) work.push([src[k], copy, k]);
  }
  return outRoot.v;
}

export const verticalFrom = (id) => (typeof id === 'string' && Object.hasOwn(VERTICALS, id) ? id : DEFAULT_VERTICAL);

// Only the brand, as a short plain string; anything else in the file is ignored.
export function loadCast(file, vertical = DEFAULT_VERTICAL) {
  const cast = { ...VERTICALS[verticalFrom(vertical)] };
  if (!file) return cast;
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'))?.cast?.brand;
    if (typeof v === 'string' && v.trim()) {
      const clean = v.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, ' ').trim().slice(0, MAX_CAST);
      if (!/:\/\/|@/.test(clean) && !scanHosts(clean).length) { cast.castBrand = clean; cast.castAppName = `${clean} Salesforce`; cast.castEccName = `${clean} Privilege`; }
    }
  } catch { /* no file or not JSON: the defaults */ }
  return cast;
}
