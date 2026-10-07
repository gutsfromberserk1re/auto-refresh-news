// Vercel serverless function: GET /api/news?q=&category=&page=
// Set GNEWS_KEYS in Vercel (Settings > Environment Variables), comma-separated.
export default async function handler(req, res) {
  const { q = '', category = 'general', page = '1' } = req.query;
  const keys = (process.env.GNEWS_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);

  if (!keys.length) {
    return res.status(500).json({ error: 'GNEWS_KEYS is not set' });
  }

  const params = new URLSearchParams({ lang: 'en', max: '10', page: String(page) });
  const base = q
    ? (params.set('q', q), 'https://gnews.io/api/v4/search')
    : (params.set('category', category), 'https://gnews.io/api/v4/top-headlines');

  for (const key of keys) {
    params.set('apikey', key);
    try {
      const r = await fetch(`${base}?${params}`);
      if (!r.ok) continue; // 401/403/429 etc: try the next key
      const data = await r.json();
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return res.status(200).json(data.articles || []);
    } catch (e) { /* try next key */ }
  }
  return res.status(502).json({ error: 'All GNews keys failed' });
}
