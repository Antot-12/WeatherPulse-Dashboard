import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_KEY = process.env.OPENWEATHER_API_KEY;

const cache = new Map<string, { data: any; expires: number }>();

function getCache(key: string) {
  const hit = cache.get(key);
  if (!hit || Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key: string, data: any, ttlMs: number) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 5));

    if (!q) {
      return res.status(400).json({ error: 'Missing q' });
    }

    const cacheKey = `geocode:${q}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${limit}&appid=${API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`OpenWeather error ${response.status}`);
    }

    const data = await response.json();
    setCache(cacheKey, data, 10 * 60 * 1000);
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Server error' });
  }
}
