// ════════════════════════════════════════════════
// ── lib/analytics.js — Event logging and aggregation
// ── Future: add conversion tracking, funnel analysis,
// ── retention metrics, export to CSV, scheduled reports
// ════════════════════════════════════════════════
const { pool } = require('./db');

// ── Fire-and-forget event logger ──
// Never blocks the calling route — errors are logged, not thrown
function logAnalyticsEvent(clientId, eventType, source, metadata) {
  if (!clientId || !eventType) return;
  pool.query(
    `INSERT INTO analytics_events (client_id, event_type, source, metadata) VALUES ($1, $2, $3, $4)`,
    [clientId, eventType, source || null, metadata ? JSON.stringify(metadata) : null]
  ).catch(e => console.error('[analytics]', e.message));
}

// ── Aggregated analytics query ──
async function getAnalytics(days) {
  let dateFilter = '';
  if (days > 0 && days < 9999) {
    dateFilter = `WHERE created_at >= NOW() - INTERVAL '${days} days'`;
  }
  const result = await pool.query(`
    SELECT client_id,
           COUNT(*) FILTER (WHERE event_type = 'pageview') AS pageviews,
           COUNT(*) FILTER (WHERE event_type = 'chat') AS chats,
           COUNT(*) FILTER (WHERE event_type = 'booking') AS bookings,
           COUNT(*) FILTER (WHERE event_type = 'call') AS calls,
           COUNT(*) FILTER (WHERE event_type = 'sms') AS sms
    FROM analytics_events
    ${dateFilter}
    GROUP BY client_id
    ORDER BY COUNT(*) DESC
  `);
  return result.rows;
}

console.log('[module] lib/analytics.js loaded');

module.exports = {
  logAnalyticsEvent,
  getAnalytics,
};
