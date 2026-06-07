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

async function fetchWeather(lat: number, lon: number, units: string) {
  const cacheKey = `current:${lat}:${lon}:${units}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return { lat, lon, data: cached, cached: true };
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`OpenWeather error ${response.status}`);
    }

    const data = await response.json();
    setCache(cacheKey, data, 3 * 60 * 1000);
    return { lat, lon, data, cached: false };
  } catch (e) {
    return { lat, lon, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const locations = req.body?.locations;
    const units = String(req.body?.units || 'metric');

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'Invalid locations' });
    }

    const results = await Promise.all(
      locations.slice(0, 12).map(async (loc: { lat: number; lon: number }) => {
        if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') {
          return { lat: loc?.lat, lon: loc?.lon, error: 'Invalid location' };
        }
        return fetchWeather(loc.lat, loc.lon, units);
      })
    );

    return res.json({ data: results });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Server error' });
  }
}
