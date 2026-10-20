// Bestelhub-robot: opent Chrome (Playwright), laat Claude de order invullen in het leveranciersportaal
// en schrijft status, offerte-/ordernummer en notities terug in orders/<nr>.json.
//
// Gebruik:  node verwerk.mjs HUB-0002 invullen|bestellen
// Omgeving: ANTHROPIC_API_KEY (verplicht), ROBOT_MODEL (optioneel), RUN_URL (optioneel),
//           SUPPLIER_URL (optioneel, overschrijft de portal-URL, handig om lokaal te testen),
//           HEADLESS=0 om de browser zichtbaar te maken.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(HERE, 'screenshots');
const STATE = path.join(ROOT, 'state', 'portal-state.json');

const SUPPLIERS = {
  'allround-test': {
    naam: 'Allround (testportaal Konfigo)',
    url: 'https://ambiance-organisatie.github.io/ambiance-testportaal/configurator/',
  },
};
const MODEL = process.env.ROBOT_MODEL || 'claude-sonnet-5-5';
const MAX_ROUNDS = Number(process.env.ROBOT_MAX_ROUNDS || 70);

const [nr, actie = 'invullen'] = process.argv.slice(2);
if (!nr || !/^HUB-\d{4,}$/.test(nr)) { console.error('Geef een ordernummer, bijv. HUB-0002'); process.exit(2); }
if (!['invullen', 'bestellen'].includes(actie)) { console.error('Actie moet invullen of bestellen zijn'); process.exit(2); }

const orderPath = path.join(ROOT, 'orders', `${nr}.json`);
const order = JSON.parse(await fs.readFile(orderPath, 'utf8'));
order.notes = order.notes || [];
const nieuweNotities = [];
const note = (kind, text) => {
  const n = { id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), from: 'Robot', kind, text: String(text).slice(0, 2000) };
  nieuweNotities.push(n); console.log(`[${kind}] ${n.text}`);
};
async function bewaarOrder(patch) {
  // Lees opnieuw: de hub kan intussen notities hebben toegevoegd.
  let actueel = order;
  try { actueel = JSON.parse(await fs.readFile(orderPath, 'utf8')); } catch {}
  const notes = [...(actueel.notes || [])];
  for (const n of nieuweNotities) if (!notes.some(x => x.id === n.id)) notes.push(n);
  const uit = { ...actueel, ...patch, notes, supplier: { ...(actueel.supplier || {}), ...(patch.supplier || {}) }, updatedAt: Date.now() };
  await fs.writeFile(orderPath, JSON.stringify(uit, null, 2) + '\n');
}

const supplier = SUPPLIERS[order.leverancier] || SUPPLIERS['allround-test'];
const portalUrl = process.env.SUPPLIER_URL || supplier.url;

/* ---------------- browser ---------------- */
await fs.mkdir(SHOTS, { recursive: true });
await fs.mkdir(path.dirname(STATE), { recursive: true });
let heeftState = false; try { await fs.access(STATE); heeftState = true; } catch {}
const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'nl-NL', ...(heeftState ? { storageState: STATE } : {}) });
const page = await context.newPage();
page.on('dialog', d => d.dismiss().catch(() => {}));
let shotNr = 0;
async function shot(naam) {
  shotNr++;
  const f = path.join(SHOTS, `${String(shotNr).padStart(2, '0')}-${String(naam || 'scherm').replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}.png`);
  await page.screenshot({ path: f, fullPage: false }).catch(() => {});
  return f;
}

// Leest de pagina als tekst: koppen, meldingen en alle zichtbare bedienelementen met een vaste ref.
let laatsteSnapshot = '';
async function leesPagina() {
  return laatsteSnapshot = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const txt = s => String(s || '').replace(/\s+/g, ' ').trim();
    const labelOf = el => {
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return txt(l.textContent); }
      const l = el.closest('label'); if (l) return txt(l.textContent);
      if (el.placeholder) return el.placeholder;
      return txt(el.textContent || el.value || el.name || '');
    };
    let n = 0; const regels = [];
    document.querySelectorAll('[data-rb]').forEach(e => e.removeAttribute('data-rb'));
    const sel = 'input:not([type=hidden]),select,textarea,button,a[href],[role=option],[role=tab],[role=button],li[data-v],li[data-code]';
    for (const el of document.querySelectorAll(sel)) {
      if (!vis(el) && !(el.type === 'radio' || el.type === 'checkbox')) continue;
      if ((el.type === 'radio' || el.type === 'checkbox') && !vis(el.closest('label') || el)) continue;
      const ref = 'e' + (++n); el.setAttribute('data-rb', ref);
      const tag = el.tagName.toLowerCase(); const type = el.type || '';
      let rol = tag === 'select' ? 'keuzelijst' : tag === 'textarea' ? 'tekstvak' : tag === 'button' || el.getAttribute('role') === 'button' ? 'knop' : tag === 'a' ? 'link' : tag === 'li' || el.getAttribute('role') === 'option' ? 'optie' : type === 'radio' ? 'keuzerondje' : type === 'checkbox' ? 'vinkje' : 'invoerveld';
      let r = `[${ref}] ${rol} "${labelOf(el).slice(0, 90)}"`;
      if (type === 'radio' || type === 'checkbox') r += ` waarde=${el.value} ${el.checked ? '(aangevinkt)' : ''}` + (el.name ? ` groep=${el.name}` : '');
      else if (tag === 'select') { const o = [...el.options]; r += ` gekozen="${txt(el.selectedOptions[0]?.textContent)}" opties: ${o.slice(0, 40).map(x => `${x.value}=${txt(x.textContent).slice(0, 60)}`).join(' | ')}${o.length > 40 ? ' …' : ''}`; }
      else if (tag === 'input' || tag === 'textarea') r += ` type=${type || 'text'} waarde="${String(el.value).slice(0, 80)}"${el.min ? ` min=${el.min}` : ''}`;
      if (el.disabled) r += ' (uitgeschakeld)';
      regels.push(r);
    }
    const koppen = [...document.querySelectorAll('h1,h2,h3,legend,.crumb,.sh,.sh2')].filter(vis).map(e => txt(e.textContent)).filter(Boolean).slice(0, 40);
    const meldingen = [...document.querySelectorAll('.em,.banner,[role=alert],.toast,.warnbox,.err')].filter(vis).map(e => txt(e.textContent)).filter(Boolean).slice(0, 30);
    const prijs = [...document.querySelectorAll('#p-total,#p-line,.totals,.tot')].filter(vis).map(e => txt(e.textContent)).slice(0, 4);
    return [`URL: ${location.href}`, `Titel: ${document.title}`, `Koppen: ${koppen.join(' / ')}`,
      `Meldingen: ${meldingen.length ? meldingen.join(' || ') : 'geen'}`, prijs.length ? `Prijs: ${prijs.join(' || ')}` : '',
      `Bedienelementen (${regels.length}):`, ...regels].filter(Boolean).join('\n').slice(0, 24000);
  });
}
const loc = ref => page.locator(`[data-rb="${String(ref).replace(/[^a-z0-9]/gi, '')}"]`).first();
async function naActie() {
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => [...document.querySelectorAll('.em,.banner.err,.toast,[role=alert]')].filter(e => e.offsetParent !== null || e.getClientRects().length).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8));
  return m.length ? `ok. Zichtbare meldingen: ${m.join(' || ')}` : 'ok';
}

/* ---------------- gereedschap voor Claude ---------------- */
let einde = null;
const TOOLS = [
  { name: 'lees_pagina', description: 'Leest de huidige pagina: URL, koppen, meldingen en alle zichtbare bedienelementen met een ref (e1, e2, ...). Refs veranderen na elke lees_pagina; lees opnieuw na navigeren of als de pagina verandert.', input_schema: { type: 'object', properties: {} } },
  { name: 'ga_naar', description: 'Opent een URL in het tabblad.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'klik', description: 'Klikt op een element (knop, link, keuzerondje, optie in een lijst).', input_schema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } },
  { name: 'vul_in', description: 'Vult een invoerveld of tekstvak in (vervangt de huidige waarde). Voor een weekveld: formaat 2026-W46.', input_schema: { type: 'object', properties: { ref: { type: 'string' }, waarde: { type: 'string' } }, required: ['ref', 'waarde'] } },
  { name: 'kies', description: 'Kiest een optie in een keuzelijst, op waarde of op zichtbare tekst.', input_schema: { type: 'object', properties: { ref: { type: 'string' }, waarde: { type: 'string' } }, required: ['ref', 'waarde'] } },
  { name: 'vink', description: 'Zet een vinkje aan of uit.', input_schema: { type: 'object', properties: { ref: { type: 'string' }, aan: { type: 'boolean' } }, required: ['ref', 'aan'] } },
  { name: 'toets', description: 'Drukt op een toets, bijvoorbeeld Enter, Tab of Escape.', input_schema: { type: 'object', properties: { toets: { type: 'string' } }, required: ['toets'] } },
  { name: 'schermafbeelding', description: 'Maakt een schermafbeelding voor het verslag. Met bekijken=true krijg je hem ook zelf te zien.', input_schema: { type: 'object', properties: { naam: { type: 'string' }, bekijken: { type: 'boolean' } }, required: ['naam'] } },
  { name: 'notitie', description: 'Zet een notitie bij de order in de Bestelhub. soort: info (aanname of keuze), warning (waarschuwing van het portaal of iets om te controleren), error (iets kan niet).', input_schema: { type: 'object', properties: { soort: { type: 'string', enum: ['info', 'warning', 'error'] }, tekst: { type: 'string' } }, required: ['soort', 'tekst'] } },
  { name: 'klaar', description: 'Beëindigt de taak. status: ingevuld (offerte staat klaar, niet besteld), besteld, of probleem (kon niet afronden; leg in samenvatting uit waarom).', input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['ingevuld', 'besteld', 'probleem'] }, offertenummer: { type: 'string' }, ordernummer: { type: 'string' }, samenvatting: { type: 'string' } }, required: ['status', 'samenvatting'] } },
];
async function voerUit(naam, inp) {
  try {
    switch (naam) {
      case 'lees_pagina': return await leesPagina();
      case 'ga_naar': await page.goto(String(inp.url), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500); return 'Geopend. Lees de pagina.';
      case 'klik': await loc(inp.ref).click({ timeout: 8000 }); return await naActie();
      case 'vul_in': { const l = loc(inp.ref); await l.fill(String(inp.waarde), { timeout: 8000 }); await l.dispatchEvent('change').catch(() => {}); return await naActie(); }
      case 'kies': { const l = loc(inp.ref); const v = String(inp.waarde); try { await l.selectOption({ value: v }, { timeout: 4000 }); } catch { await l.selectOption({ label: v }, { timeout: 4000 }); } return await naActie(); }
      case 'vink': { const l = loc(inp.ref); inp.aan ? await l.check({ timeout: 8000 }) : await l.uncheck({ timeout: 8000 }); return await naActie(); }
      case 'toets': await page.keyboard.press(String(inp.toets)); return await naActie();
      case 'schermafbeelding': { const f = await shot(inp.naam); if (inp.bekijken) { const b = await fs.readFile(f); return [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b.toString('base64') } }]; } return 'Opgeslagen.'; }
      case 'notitie': note(['info', 'warning', 'error'].includes(inp.soort) ? inp.soort : 'info', inp.tekst); return 'Genoteerd.';
      case 'klaar': einde = inp; return 'Afgerond.';
      default: return 'Onbekend gereedschap.';
    }
  } catch (e) { return `Fout: ${String(e.message || e).split('\n')[0].slice(0, 300)}. Lees de pagina opnieuw en probeer het anders.`; }
}

/* ---------------- opdracht ---------------- */
const orderVoorClaude = JSON.parse(JSON.stringify(order)); delete orderVoorClaude.notes;
const OPDRACHT = `Je bent de bestelrobot van Ambiance Zonwering. Je werkt in een Chrome-tabblad in het dealerportaal van de leverancier ${supplier.naam}: ${portalUrl}
Je enige bron is de order hieronder uit de Bestelhub. Actie: ${actie.toUpperCase()}.

ORDER (JSON):
${JSON.stringify(orderVoorClaude, null, 2)}

Uitleg bij de orderwaarden:
- lines[].productId: carre95 = "Ambiance Carré 95", carre110 = "Carré 110", arcos = "Arcos", profielen = "Kokers en hoeklijnen".
- breedte/uitval/lengte in mm. bed: io = Somfy Sunea io, wt = Somfy Orea WT, oog = oogwindwerk, mono = monocommando. zijde: L = links, R = rechts.
- zender: situo = Somfy Situo 1 io II, smoove = Smoove Origin io, geen = geen zender. kleur: RAL-code of structuurlak (bijv. 7016-SL).
- arcoll = doekcollectie (amb = Ambiance acrylcollectie, sat-lum3d = Sattler Lumera 3D, dick-std = Dickson standaard uni enz.), doekcode = doeknummer.
- armen: wind = windvaste armen (standaard), vast, storm, balkon, glij170, glij200. koppel ja + delen = gekoppeld met doorlopende kap.
- levering: dealer = afleveren bij dealer (adres staat in adres), klant = bij eindklant, afhalen = afhalen. leverweek in ISO-formaat (2026-W46).

WERKWIJZE
${actie === 'invullen' ? `1. Open het portaal, ga naar Order Entry en configureer elke orderregel met precies de opgegeven waarden. Gebruik zoekvelden ("Zoeken...") door erop te klikken, de code te typen en de juiste optie te kiezen.
2. Regel 1: "Nieuwe offerte maken". Volgende regels: voeg ze toe aan dezelfde offerte ("Nieuwe configuratie toevoegen" of "+ Configuratie toevoegen").
3. Klant: kies een bestaand CRM-account met dezelfde naam; bestaat die niet, maak een nieuw account met de klantgegevens uit de order. Referentie = order.ref, leverweek = order.leverweek, levering en adres zoals in de order, opmerking = order.opmerking.
4. Bevestig waar het portaal om bevestiging vraagt, behalve bestellen. Druk NOOIT op "Offerte bestellen" of "Definitief bestellen".
5. Lees aan het eind het offertenummer af en roep klaar aan met status "ingevuld" en het offertenummer.` : `1. Open in het portaal de offerte ${order.supplier?.offerte || '(geen offertenummer bekend)'} onder Offertes.
2. Controleer dat de regels, leverweek en levering overeenkomen met de order. Wijkt iets af: niet bestellen, maar klaar met status "probleem".
3. Vink de bevestigingen aan (maten gecontroleerd, leveringsvoorwaarden) en bestel. Bevestig de bestelling.
4. Lees het ordernummer af en roep klaar aan met status "besteld" en het ordernummer.`}

REGELS
- Verzin niets. Ontbreekt informatie, of geeft het portaal een foutmelding die je alleen kunt oplossen door iets anders te kiezen dan de order zegt: kies niet zelf. Zet een notitie (soort error) met wat er mis is en welke opties er zijn, en stop met klaar(status "probleem").
- Toont het portaal een waarschuwing of een prijs die opvalt, zet dan een notitie (soort warning). Een aanname die je moest doen: notitie (soort info).
- Werk efficiënt: je mag meerdere acties tegelijk aanvragen. Lees de pagina opnieuw na navigeren of als refs niet meer kloppen.
- Maak een schermafbeelding van de offerte of order aan het eind.
- Schrijf notities in kort, helder Nederlands.`;

/* ---------------- Claude-lus ---------------- */
async function vraagClaude(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY ontbreekt. Zet hem als secret in de repository.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: OPDRACHT, tools: TOOLS, messages }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return await res.json();
}
// Voor lokaal testen zonder API-sleutel: ROBOT_FAKE=pad/naar/script.json met een lijst tool-aanroepen.
async function* nepClaude() {
  const stappen = JSON.parse(await fs.readFile(process.env.ROBOT_FAKE, 'utf8'));
  for (const s of stappen) {
    const input = { ...(s[1] || {}) };
    if (input.zoek) { // test-hulp: ref opzoeken op tekst in de laatste paginabeschrijving
      const re = new RegExp(input.zoek, 'i'); const r = laatsteSnapshot.split('\n').filter(l => re.test(l))[input.nr || 0];
      input.ref = r ? r.match(/\[(e\d+)\]/)[1] : 'e0'; delete input.zoek; delete input.nr;
    }
    yield { content: [{ type: 'tool_use', id: 't' + Math.random().toString(36).slice(2), name: s[0], input }], stop_reason: 'tool_use' };
  }
}

let resultaat;
try {
  await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
  const messages = [{ role: 'user', content: `Begin met de actie "${actie}" voor ${nr}. Hier is de beginpagina:\n\n${await leesPagina()}` }];
  const nep = process.env.ROBOT_FAKE ? nepClaude() : null;
  for (let ronde = 0; ronde < MAX_ROUNDS && !einde; ronde++) {
    const antwoord = nep ? (await nep.next()).value : await vraagClaude(messages);
    if (!antwoord) break;
    messages.push({ role: 'assistant', content: antwoord.content });
    const uses = antwoord.content.filter(c => c.type === 'tool_use');
    for (const t of antwoord.content) if (t.type === 'text' && t.text.trim()) console.log('Claude:', t.text.trim().slice(0, 500));
    if (!uses.length) { if (antwoord.stop_reason === 'end_turn') messages.push({ role: 'user', content: 'Ga verder. Rond af met het gereedschap klaar.' }); continue; }
    const results = [];
    for (const u of uses) { const out = await voerUit(u.name, u.input || {}); console.log(`> ${u.name} ${JSON.stringify(u.input || {}).slice(0, 160)} → ${typeof out === 'string' ? out.split('\n')[0].slice(0, 160) : '[afbeelding]'}`); results.push({ type: 'tool_result', tool_use_id: u.id, content: out }); if (einde) break; }
    // Houd het gesprek compact: oude paginabeschrijvingen inkorten.
    for (const m of messages.slice(0, -2)) if (Array.isArray(m.content)) for (const c of m.content) if (c.type === 'tool_result' && typeof c.content === 'string' && c.content.length > 1500) c.content = c.content.slice(0, 300) + '\n[… ingekort; lees de pagina opnieuw voor actuele refs]';
    messages.push({ role: 'user', content: results });
  }
  await shot('eind');
  if (!einde) { note('error', `De robot is gestopt zonder af te ronden (maximaal ${MAX_ROUNDS} stappen).`); einde = { status: 'probleem', samenvatting: 'Niet afgerond.' }; }
  resultaat = einde;
} catch (e) {
  note('error', `De robot liep vast: ${String(e.message || e).slice(0, 400)}`);
  await shot('fout');
  resultaat = { status: 'probleem', samenvatting: 'Technische fout.' };
}

note(resultaat.status === 'probleem' ? 'error' : 'ok', `${resultaat.samenvatting}${process.env.RUN_URL ? `\nVerslag en schermafbeeldingen: ${process.env.RUN_URL}` : ''}`);
const patch = { status: resultaat.status, supplier: {} };
if (resultaat.offertenummer) patch.supplier.offerte = resultaat.offertenummer;
if (resultaat.ordernummer) patch.supplier.order = resultaat.ordernummer;
await bewaarOrder(patch);
await context.storageState({ path: STATE }).catch(() => {});
await browser.close();
console.log(`Klaar: ${nr} → ${resultaat.status}`);
