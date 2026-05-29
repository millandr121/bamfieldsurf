/**
 * Bamfield surf — shared peer review API (Cloudflare Worker + D1)
 *
 * GET  /reviews/:spotKey  → { entries: [...] }
 * POST /reviews           → JSON body (see index.html appendPeerReview)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_ROWS = 2000;
const DFO_STATION = '5cebf1e23d0f4a073c4bc062';
const DFO_BASE = 'https://api-iwls.dfo-mpo.gc.ca/api/v1/stations';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function bad(msg, status = 400) {
  return json({ error: msg }, status);
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToEntry(r) {
  return {
    dayYmd: r.day_ymd,
    dayStr: r.day_ymd,
    residualFt: r.residual_ft,
    modelFtSnapshot: r.model_ft,
    periodS: r.period_s,
    energyKj: r.energy_kj,
    swellDirDeg: r.swell_dir_deg,
    windDirDeg: r.wind_dir_deg,
    windSpeedKmh: r.wind_speed_kmh,
    windSwellAngleDeg: r.wind_swell_angle_deg,
    observedFt: r.observed_ft,
    viewerId: r.viewer_id,
    ts: r.ts,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (request.method === 'GET' && path.startsWith('/reviews/')) {
        const spotKey = decodeURIComponent(path.slice('/reviews/'.length)).trim();
        if (!spotKey || !/^[a-z0-9_]+$/i.test(spotKey)) {
          return bad('Invalid spot key');
        }

        const { results } = await env.DB.prepare(
          `SELECT spot_key, day_ymd, residual_ft, model_ft, period_s, energy_kj,
                  swell_dir_deg, wind_dir_deg, wind_speed_kmh, wind_swell_angle_deg,
                  observed_ft, viewer_id, ts
           FROM peer_reviews
           WHERE spot_key = ?
           ORDER BY ts DESC
           LIMIT ?`
        ).bind(spotKey, MAX_ROWS).all();

        return json({ entries: (results || []).map(rowToEntry) });
      }

      if (request.method === 'POST' && path === '/reviews') {
        let body;
        try {
          body = await request.json();
        } catch (_) {
          return bad('Invalid JSON');
        }

        const spotKey = String(body.spotKey || '').trim();
        const dayYmd = String(body.dayYmd || body.dayStr || '').slice(0, 10);
        const residualFt = num(body.residualFt);
        const ts = num(body.ts) ?? Date.now();

        if (!spotKey || !/^[a-z0-9_]+$/i.test(spotKey)) return bad('Invalid spotKey');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) return bad('Invalid dayYmd');
        if (residualFt == null || residualFt < -15 || residualFt > 15) return bad('Invalid residualFt');

        await env.DB.prepare(
          `INSERT INTO peer_reviews (
            spot_key, day_ymd, residual_ft, model_ft, period_s, energy_kj,
            swell_dir_deg, wind_dir_deg, wind_speed_kmh, wind_swell_angle_deg,
            observed_ft, viewer_id, ts
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          spotKey,
          dayYmd,
          residualFt,
          num(body.modelFt ?? body.modelFtSnapshot),
          num(body.periodS),
          num(body.energyKj),
          num(body.swellDirDeg),
          num(body.windDirDeg),
          num(body.windSpeedKmh),
          num(body.windSwellAngleDeg),
          num(body.observedFt),
          body.viewerId ? String(body.viewerId).slice(0, 64) : null,
          Math.floor(ts),
        ).run();

        return json({ ok: true }, 201);
      }

      if (request.method === 'GET' && path.startsWith('/buoy/')) {
        const id = path.slice('/buoy/'.length).trim();
        if (!/^\d{5}$/.test(id)) return bad('Invalid buoy station id');
        const upstream = 'https://www.ndbc.noaa.gov/data/realtime2/' + id + '.txt';
        const res = await fetch(upstream, {
          headers: { 'User-Agent': 'bamfield-peer-api/1.0' },
        });
        return new Response(await res.text(), {
          status: res.status,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS },
        });
      }

      if (request.method === 'GET' && path.startsWith('/tide/')) {
        const code = path.slice('/tide/'.length).trim();
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        if (!code || !/^[a-z0-9-]+$/i.test(code)) return bad('Invalid tide code');
        if (!from || !to) return bad('from and to query params required');
        const upstream = DFO_BASE + '/' + DFO_STATION + '/data?time-series-code='
          + encodeURIComponent(code) + '&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
        const res = await fetch(upstream, {
          headers: { Accept: 'application/json', 'User-Agent': 'bamfield-peer-api/1.0' },
        });
        return new Response(await res.text(), {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      if (path === '/' || path === '/health') {
        return json({ ok: true, service: 'bamfield-peer-api' });
      }

      return bad('Not found', 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  },
};
