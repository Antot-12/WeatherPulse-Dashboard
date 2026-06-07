import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
    cacheSize: 0,
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
