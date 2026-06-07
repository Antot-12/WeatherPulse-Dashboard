import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_KEY = process.env.OPENWEATHER_API_KEY;

// Simple in-memory cache
const cache = new Map<string, { data: any; expires: number }>();

function getCache(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key: string, data: any, ttlMs: number) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OpenWeather error ${res.status}`);
  }
  return res.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get path from URL, removing /api/ prefix
  const url = req.url || '';
  const pathMatch = url.match(/\/api\/(.+?)(?:\?|$)/);
  const pathStr = pathMatch ? pathMatch[1] : '';

  console.log('Request URL:', url, 'Path:', pathStr);

  try {
    // /api/geocode
    if (pathStr === 'geocode') {
      const q = String(req.query.q || '').trim();
      const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 5));

      if (!q) {
        return res.status(400).json({ error: 'Missing q' });
      }

      const cacheKey = `geocode:${q}:${limit}`;
      const cached = getCache(cacheKey);
      if (cached) {
        return res.json({ source: 'cache', data: cached });
      }

      const apiUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${limit}&appid=${API_KEY}`;
      const data = await fetchJson(apiUrl);
      setCache(cacheKey, data, 10 * 60 * 1000);
      return res.json({ source: 'live', data });
    }

    // /api/weather/current
    if (pathStr === 'weather/current') {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      const units = String(req.query.units || 'metric');

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ error: 'Invalid lat/lon' });
      }

      const cacheKey = `current:${lat}:${lon}:${units}`;
      const cached = getCache(cacheKey);
      if (cached) {
        return res.json({ source: 'cache', data: cached });
      }

      const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
      const data = await fetchJson(apiUrl);
      setCache(cacheKey, data, 3 * 60 * 1000);
      return res.json({ source: 'live', data });
    }

    // /api/weather/forecast
    if (pathStr === 'weather/forecast') {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      const units = String(req.query.units || 'metric');

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ error: 'Invalid lat/lon' });
      }

      const cacheKey = `forecast:${lat}:${lon}:${units}`;
      const cached = getCache(cacheKey);
      if (cached) {
        return res.json({ source: 'cache', data: cached });
      }

      const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
      const data = await fetchJson(apiUrl);
      setCache(cacheKey, data, 10 * 60 * 1000);
      return res.json({ source: 'live', data });
    }

    // /api/weather/batch
    if (pathStr === 'weather/batch' && req.method === 'POST') {
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

          const cacheKey = `current:${loc.lat}:${loc.lon}:${units}`;
          const cached = getCache(cacheKey);
          if (cached) {
            return { lat: loc.lat, lon: loc.lon, data: cached, cached: true };
          }

          try {
            const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${loc.lat}&lon=${loc.lon}&units=${units}&appid=${API_KEY}`;
            const data = await fetchJson(apiUrl);
            setCache(cacheKey, data, 3 * 60 * 1000);
            return { lat: loc.lat, lon: loc.lon, data, cached: false };
          } catch (e) {
            return { lat: loc.lat, lon: loc.lon, error: e instanceof Error ? e.message : 'Failed' };
          }
        })
      );

      return res.json({ data: results });
    }

    // /api/metrics - simplified version
    if (pathStr === 'metrics') {
      return res.json({
        uptimeSec: Math.floor(process.uptime()),
        node: process.version,
        updatedAt: new Date().toISOString(),
        requestsTotal: 0,
        errorsTotal: 0,
        req1m: 0,
        rps1m: 0,
        errors1m: 0,
        openWeatherCalls: 0,
        openWeatherErrors: 0,
        owErrors1m: 0,
        lastLatencyMs: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        cacheSize: cache.size,
        cacheHits: 0,
        cacheMisses: 0,
        cacheHitRate: 0,
        cacheHits1m: 0,
        cacheMisses1m: 0,
        cacheHitRate1m: 0,
        latencySeries: [],
        rpsSeries: [],
        eventLoopLagSeries: [],
        eventLoopLagLastMs: 0,
        eventLoopLagAvgMs: 0,
        eventLoopLagP95Ms: 0,
        topRoutes: [],
        statusCounts: {},
        openWeatherStatusCounts: {},
        memoryMB: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
        },
      });
    }

    return res.status(404).json({ error: 'Not found', path: pathStr, url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Server error' });
  }
}
