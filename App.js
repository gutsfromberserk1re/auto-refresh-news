/* NewsTok: no API keys, works on any static host. */
const BBC = 'https://feeds.bbci.co.uk/';
const SOURCE = 'BBC News';
const CATS = [
  ['top', 'Home', BBC + 'news/rss.xml'],
  ['world', 'World', BBC + 'news/world/rss.xml'],
  ['business', 'Business', BBC + 'news/business/rss.xml'],
  ['technology', 'Technology', BBC + 'news/technology/rss.xml'],
  ['science', 'Science', BBC + 'news/science_and_environment/rss.xml'],
  ['health', 'Health', BBC + 'news/health/rss.xml'],
  ['entertainment', 'Culture', BBC + 'news/entertainment_and_arts/rss.xml'],
  ['sport', 'Sport', BBC + 'sport/rss.xml']
];
const CACHE_MS = 5 * 60 * 1000;
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = h => new DOMParser().parseFromString(h || '', 'text/html').body.textContent.trim();
const hash = s => { let h = 5381; for (const c of s) h = (h * 33 ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };
function timeAgo(d) {
  if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(d || '')) d = d.replace(' ', 'T') + 'Z';
  const t = Date.parse(d); if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return m + (m === 1 ? ' min ago' : ' mins ago');
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? ' hr ago' : ' hrs ago');
  const days = Math.round(h / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}
const meta = a => [timeAgo(a.date), a.source].filter(Boolean).join(' | ');
const isSearch = key => key.startsWith('q:');
const feedUrl = key => isSearch(key)
  ? 'https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=' + encodeURIComponent(key.slice(2))
  : (CATS.find(c => c[0] === key) || CATS[0])[2];
const catLabel = key => isSearch(key) ? 'search results' : (CATS.find(c => c[0] === key) || CATS[0])[1];

/* ---------- data ---------- */
async function viaJson(url) {
  const r = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url));
  const d = await r.json();
  if (d.status !== 'ok') throw new Error('rss2json');
  return d.items.map(i => ({ title: i.title, description: i.description, content: i.content, link: i.link, image: i.thumbnail || i.enclosure?.link || null, pubDate: i.pubDate }));
}
async function viaXml(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('xml');
  const x = new DOMParser().parseFromString(await r.text(), 'text/xml');
  return [...x.querySelectorAll('item')].map(n => {
    const g = t => n.querySelector(t)?.textContent || '';
    const m = n.getElementsByTagNameNS('*', 'thumbnail')[0];
    return { title: g('title'), description: g('description'), content: '', link: g('link'), image: m?.getAttribute('url') || null, pubDate: g('pubDate') };
  });
}
function normalise(o, key) {
  let title = text(o.title), source = SOURCE;
  if (isSearch(key)) { // Google News titles look like "Headline - Source"
    const i = title.lastIndexOf(' - ');
    if (i > 0) { source = title.slice(i + 3); title = title.slice(0, i); }
  }
  const summary = isSearch(key) ? '' : text(o.description);
  const full = text(o.content);
  const thumb = o.image || null;
  const image = thumb && thumb.includes('ichef.bbci.co.uk') ? thumb.replace('/240/', '/800/') : thumb;
  return { id: hash(o.link), title, summary, content: full.length > summary.length + 40 ? full : '', url: o.link, image, thumb, date: o.pubDate, source };
}
async function getFeed(key) {
  const ck = 'nt:feed:' + key;
  try { const c = JSON.parse(sessionStorage.getItem(ck)); if (c && Date.now() - c.t < CACHE_MS) return c.items; } catch (e) {}
  const url = feedUrl(key);
  let raw;
  try { raw = await viaJson(url); } catch (e) { raw = await viaXml(url); }
  const items = raw.filter(o => o.link && o.title).map(o => normalise(o, key));
  try {
    items.forEach(a => sessionStorage.setItem('nt:a:' + a.id, JSON.stringify(a)));
    sessionStorage.setItem(ck, JSON.stringify({ t: Date.now(), items }));
  } catch (e) {}
  return items;
}

/* ---------- shared header ---------- */
function initHeader(activeKey) {
  $('#nav').innerHTML = CATS.map(([id, label]) =>
    `<a href="index.html?c=${id}" class="${id === activeKey ? 'on' : ''}">${label}</a>`).join('');
  $('#search').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (q) location.href = 'index.html?q=' + encodeURIComponent(q);
  });
}

/* ---------- home page ---------- */
function story(a, key, { img = true, summary = true } = {}) {
  const href = `article.html?id=${a.id}&c=${encodeURIComponent(key)}`;
  const pic = img && a.image
    ? `<img src="${esc(a.image)}" data-t="${esc(a.thumb || '')}" alt="" loading="lazy" onerror="imgFail(this)">` : '';
  return `<article class="s"><a href="${href}">${pic}<div>
    <h2>${esc(a.title)}</h2>${summary && a.summary ? `<p>${esc(a.summary)}</p>` : ''}
    <div class="meta">${esc(meta(a))}</div></div></a></article>`;
}
function imgFail(el) {
  if (el.dataset.t && el.src !== el.dataset.t) el.src = el.dataset.t; else el.remove();
}
function renderHome(items, key) {
  const [lead, ...rest] = items;
  const side = rest.slice(0, 2), row = rest.slice(2, 6), more = rest.slice(6);
  $('#content').innerHTML = `
    <section class="top">
      <div class="lead">${story(lead, key)}</div>
      <div class="side">${side.map(a => story(a, key)).join('')}</div>
    </section>
    ${row.length ? `<section class="row">${row.map(a => story(a, key)).join('')}</section>` : ''}
    ${more.length ? `<section class="more">${more.map(a => story(a, key, { summary: false })).join('')}</section>` : ''}`;
}
async function initHome() {
  const q = params.get('q');
  const key = q ? 'q:' + q : (params.get('c') || 'top');
  initHeader(q ? '' : key);
  if (q) $('#q').value = q;
  $('#title').textContent = q ? `Search results for “${q}”` : catLabel(key) === 'Home' ? 'Top stories' : catLabel(key);
  document.title = $('#title').textContent + ' | NewsTok';
  $('#status').textContent = 'Loading…';
  try {
    const items = await getFeed(key);
    $('#status').textContent = '';
    if (!items.length) { $('#status').textContent = 'No stories found. Try a different search.'; return; }
    renderHome(items, key);
  } catch (e) {
    console.error(e);
    $('#status').textContent = 'Could not load stories. Check your connection and refresh the page.';
  }
}

/* ---------- article page ---------- */
async function initArticle() {
  const id = params.get('id'), key = params.get('c') || 'top';
  initHeader(isSearch(key) ? '' : key);
  let a = null;
  try { a = JSON.parse(sessionStorage.getItem('nt:a:' + id)); } catch (e) {}
  if (!a) { try { a = (await getFeed(key)).find(x => x.id === id); } catch (e) {} }
  const back = isSearch(key) ? 'index.html?q=' + encodeURIComponent(key.slice(2)) : 'index.html?c=' + key;
  if (!a) {
    $('#story').innerHTML = `<p class="crumb"><a href="index.html">← Back to top stories</a></p><p id="status">This story is no longer in the feed. Return to the home page to find it.</p>`;
    return;
  }
  document.title = a.title + ' | NewsTok';
  const paras = [a.content || a.summary].filter(Boolean).map(t => t.split(/\n{2,}/).map(p => `<p class="body">${esc(p)}</p>`).join('')).join('');
  $('#story').innerHTML = `
    <p class="crumb"><a href="${back}">← Back to ${esc(catLabel(key))}</a></p>
    <h1>${esc(a.title)}</h1>
    <div class="meta">${esc(meta(a))}</div>
    ${a.image ? `<img class="hero" src="${esc(a.image)}" data-t="${esc(a.thumb || '')}" alt="" onerror="imgFail(this)">` : ''}
    ${paras}
    <a class="btn" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Read the full story on ${esc(a.source)}</a>`;
}

document.body.dataset.page === 'article' ? initArticle() : initHome();
