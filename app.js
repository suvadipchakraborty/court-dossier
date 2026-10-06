const SITE = 'https://court-dossier.suvadipchakraborty.workers.dev/';
const KEYWORDS = ['investigation', 'arrest', 'trial', 'background', 'discovery'];

// Each category yields a SPARQL "WHERE" pattern binding ?item.
// Types are matched by QID or by exact English label (labels avoid guessing QIDs).
const byLabel = labels => `?item wdt:P31 ?t . ?t rdfs:label ?tl . FILTER(LCASE(STR(?tl)) IN (${labels.map(l => `"${l}"`).join(',')}))`;
const CATEGORIES = {
  homicides: '?item wdt:P31 wd:Q132821 .',
  robberies: byLabel(['bank robbery', 'robbery', 'heist']),
  trials: '?item wdt:P31 wd:Q2334719 . ?item wdt:P31 ?x . FILTER(?x = wd:Q2334719)',
  supreme: byLabel(['united states supreme court decision'])
};

const buildQuery = cat => `
SELECT ?item ?label ?wikiTitle (SAMPLE(?d) AS ?date) (SAMPLE(?locL) AS ?place) WHERE {
  ${CATEGORIES[cat]}
  ?item rdfs:label ?label . FILTER(LANG(?label)="en")
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?wikiTitle .
  OPTIONAL { ?item wdt:P585|wdt:P577|wdt:P571 ?d }
  OPTIONAL { ?item wdt:P276|wdt:P17 ?loc . ?loc rdfs:label ?locL . FILTER(LANG(?locL)="en") }
} GROUP BY ?item ?label ?wikiTitle LIMIT 80`;

const $ = s => document.querySelector(s);
const grid = $('#grid'), statusEl = $('#status'), modal = $('#modal');
let current = null, lastFocus = null;

// ---------- Archives ----------
async function loadCases() {
  const cat = $('#category').value;
  grid.innerHTML = '';
  statusEl.textContent = 'Pulling files from the archive…';
  try {
    const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(buildQuery(cat));
    const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } });
    if (!res.ok) throw new Error('Wikidata returned ' + res.status);
    const rows = (await res.json()).results.bindings;
    const seen = new Set();
    const cases = rows.map(r => ({
      name: r.label.value, title: r.wikiTitle.value,
      year: r.date ? new Date(r.date.value).getUTCFullYear() : null,
      place: r.place ? r.place.value : 'Location unknown'
    })).filter(c => c.name && !/^Q\d+$/.test(c.name) && !seen.has(c.title) && seen.add(c.title))
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    if (!cases.length) { statusEl.textContent = 'No files found in this category. Try another.'; return; }
    statusEl.textContent = `${cases.length} case files`;
    grid.append(...cases.map(card));
  } catch (err) {
    statusEl.innerHTML = 'Could not reach Wikidata. Check your connection, then <button id="retry">retry</button>.';
    $('#retry').onclick = loadCases;
  }
}

function card(c) {
  const b = document.createElement('button');
  b.className = 'folder';
  const yr = document.createElement('span'); yr.className = 'year'; yr.textContent = c.year && c.year > 0 ? c.year : 'Undated';
  const h = document.createElement('h3'); const hl = document.createElement('span'); hl.className = 'hl'; hl.textContent = c.name; h.append(hl);
  const loc = document.createElement('span'); loc.className = 'loc'; loc.textContent = c.place;
  const top = document.createElement('div'); top.append(yr, h);
  b.append(top, loc);
  b.onclick = () => openCase(c);
  return b;
}

// ---------- Section parser ----------
const api = (params) => 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'parse', format: 'json', origin: '*', redirects: '1', ...params });
async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); const j = await r.json(); if (j.error) throw new Error(j.error.info); return j; }

async function openCase(c) {
  current = c; lastFocus = document.activeElement;
  $('#mTitle').textContent = c.name;
  $('#mMeta').textContent = [c.year, c.place].filter(Boolean).join(' | ');
  $('#mSrc').innerHTML = '';
  $('#mBody').innerHTML = '<p>Opening the file…</p>';
  modal.hidden = false; modal.scrollTop = 0; document.body.style.overflow = 'hidden';
  $('#mClose').focus();
  try {
    const toc = await getJSON(api({ page: c.title, prop: 'sections' }));
    const hits = toc.parse.sections.filter(s => s.toclevel === 1 && KEYWORDS.some(k => s.line.toLowerCase().includes(k))).slice(0, 5);
    const targets = hits.length ? hits.map(s => ({ index: s.index, line: s.line.replace(/<[^>]+>/g, '') })) : [{ index: '0', line: 'Summary' }];
    const parts = await Promise.all(targets.map(t => getJSON(api({ page: c.title, prop: 'text', section: t.index })).then(j => ({ t, html: clean(j.parse.text['*']) }))));
    const body = $('#mBody'); body.innerHTML = '';
    parts.forEach(({ t, html }) => {
      if (!html.textContent.trim()) return;
      if (t.index !== '0') { const h = document.createElement('h2'); h.className = 'sec'; h.textContent = t.line; body.append(h); }
      body.append(html);
    });
    if (!body.textContent.trim()) body.innerHTML = '<p>No narrative text is available for this case. Open the full article below.</p>';
    const link = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(c.title.replace(/ /g, '_'));
    $('#mSrc').innerHTML = `Source: <a href="${link}" target="_blank" rel="noopener">Wikipedia — ${esc(c.title)}</a> (CC BY-SA)`;
  } catch (e) {
    $('#mBody').innerHTML = '<p>This file could not be opened. Check your connection and try again.</p>';
  }
}

function clean(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('.mw-parser-output') || doc.body;
  root.querySelectorAll('.mw-editsection,sup.reference,.reference,.infobox,table,.navbox,.hatnote,.thumb,figure,style,script,.mw-empty-elt,.sidebar,.metadata,.ambox,.gallery,.noprint,.mw-heading,h1,h2,h3,h4,h5,h6').forEach(n => n.remove());
  root.querySelectorAll('a').forEach(a => a.replaceWith(...a.childNodes));
  root.querySelectorAll('p').forEach(p => { if (!p.textContent.trim()) p.remove(); });
  let out = root.innerHTML.replace(/\[\s*(\d+|[a-z]|citation needed|note \d+)\s*\]/gi, '');
  const frag = document.createElement('div'); frag.innerHTML = out;
  return frag;
}
const esc = s => s.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

function closeModal() { modal.hidden = true; document.body.style.overflow = ''; lastFocus && lastFocus.focus(); }
$('#mClose').onclick = closeModal;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
$('#mShare').onclick = async () => {
  if (!current) return;
  const data = { title: current.name, text: `Read the investigation dossier on ${current.name}…`, url: SITE };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); $('#mShare').textContent = '✓ Copied'; setTimeout(() => $('#mShare').textContent = '⤴ Share', 1800); }
  } catch (_) { /* share cancelled */ }
};

// ---------- Tabs ----------
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  window.scrollTo(0, 0);
});
$('#category').onchange = loadCases;

// ---------- PWA ----------
let deferred;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; $('#installHint').hidden = true; });
$('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; $('#installHint').textContent = 'Installed. Open Court Dossier from your home screen.'; $('#installHint').hidden = false; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

loadCases();
