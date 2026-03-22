/**
 * Endpoint Health Check — فحص صحة نقاط النهاية
 * ================================================
 * Tests all 30+ API endpoints for HTTP 200/201 responses.
 * Uses a real JWT token from DB to authenticate.
 * Reports PASS/FAIL for each endpoint.
 */

'use strict';

const http   = require('http');
const path   = require('path');

// Load backend env
try {
  require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env') });
} catch (_) {}

const API_BASE = 'http://localhost:5000/api/v1';
const PORT     = 5000;

let passed = 0;
let failed = 0;
const failedEndpoints = [];

// ─── HTTP Helper ─────────────────────────────────────────────────────────────
function httpReq(method, urlPath, token, body) {
  return new Promise((resolve) => {
    const headers = { Authorization: token ? 'Bearer ' + token : '' };
    if (body) {
      headers['Content-Type'] = 'application/json';
      const bodyStr = JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const r = http.request({
      hostname: 'localhost', port: PORT,
      path: urlPath, method,
      headers,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', e => resolve({ status: 0, body: e.message }));
    r.setTimeout(10000, () => { r.destroy(); resolve({ status: 0, body: 'timeout' }); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// ─── Auth Token ───────────────────────────────────────────────────────────────
async function getAuthToken() {
  // Use the demo login endpoint
  const r = await httpReq('POST', '/api/v1/auth/demo', null, {});
  if (r.status === 200) {
    try {
      const data = JSON.parse(r.body);
      const token = data.data?.accessToken || data.data?.token || data.token;
      if (token) {
        console.log(`🔑 Demo auth token obtained (len: ${token.length})`);
        return token;
      }
    } catch (_) {}
  }
  console.log('⚠️  Demo login failed:', r.status, r.body.slice(0, 100));
  return null;
}

// ─── Test runner ─────────────────────────────────────────────────────────────
async function testEndpoint(label, method, urlPath, token, body, expectedStatus = [200, 201]) {
  const r = await httpReq(method, urlPath, token, body);
  const ok = expectedStatus.includes(r.status);
  if (ok) {
    passed++;
    console.log(`  ✅ ${label} → ${r.status}`);
  } else {
    failed++;
    failedEndpoints.push({ label, method, urlPath, status: r.status, body: r.body.slice(0, 100) });
    console.log(`  ❌ ${label} → ${r.status} | ${r.body.slice(0, 120)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('   LifeFlow Endpoint Health Check');
  console.log('══════════════════════════════════════════════\n');

  // ── Health (no auth) ─────────────────────────────────────────────────────
  console.log('── Public Endpoints ──');
  await testEndpoint('Health',  'GET',  '/api/v1/health', null);

  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = await getAuthToken();

  if (!token) {
    console.log('\n⚠️  Cannot test authenticated endpoints without a valid token.');
    console.log(`\n   Results: ${passed} PASS, ${failed} FAIL (auth skipped)\n`);
    process.exit(failed > 0 ? 1 : 0);
    return;
  }

  // ── User / Profile ────────────────────────────────────────────────────────
  console.log('\n── User & Profile ──');
  await testEndpoint('Profile',     'GET', '/api/v1/users/profile', token);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  console.log('\n── Tasks ──');
  await testEndpoint('Tasks List',  'GET', '/api/v1/tasks',         token);

  // ── Habits ────────────────────────────────────────────────────────────────
  console.log('\n── Habits ──');
  await testEndpoint('Habits List', 'GET', '/api/v1/habits',        token);

  // ── Mood ─────────────────────────────────────────────────────────────────
  console.log('\n── Mood ──');
  await testEndpoint('Today Mood',  'GET', '/api/v1/mood/today',    token);

  // ── Dashboard ────────────────────────────────────────────────────────────
  console.log('\n── Dashboard ──');
  await testEndpoint('Dashboard',   'GET', '/api/v1/dashboard',     token);

  // ── Calendar ─────────────────────────────────────────────────────────────
  console.log('\n── Calendar ──');
  await testEndpoint('Calendar',    'GET', '/api/v1/calendar',      token);

  // ── Notifications ────────────────────────────────────────────────────────
  console.log('\n── Notifications ──');
  await testEndpoint('Notifications','GET','/api/v1/notifications', token);

  // ── AI Routes ────────────────────────────────────────────────────────────
  console.log('\n── AI Routes ──');
  await testEndpoint('AI Status',   'GET', '/api/v1/ai/status',     token);
  await testEndpoint('AI Chat',     'POST','/api/v1/ai/chat',        token, { message: 'كيف حالك؟' });
  await testEndpoint('AI Chat History','GET','/api/v1/ai/chat/history',token);

  // ── Intelligence ─────────────────────────────────────────────────────────
  console.log('\n── Intelligence ──');
  await testEndpoint('Life Score',      'GET', '/api/v1/intelligence/life-score',   token);
  await testEndpoint('Burnout Risk',    'GET', '/api/v1/intelligence/burnout-risk', token);
  await testEndpoint('Timeline',        'GET', '/api/v1/intelligence/timeline',     token);

  // ── Assistant Routes ──────────────────────────────────────────────────────
  console.log('\n── Assistant ──');
  await testEndpoint('Assistant Context',  'GET', '/api/v1/assistant/context',   token);
  await testEndpoint('Assistant History',  'GET', '/api/v1/assistant/history',   token);
  await testEndpoint('Assistant Profile',  'GET', '/api/v1/assistant/profile',   token);
  await testEndpoint('Assistant Decisions','GET', '/api/v1/assistant/decisions', token);
  await testEndpoint('Assistant Monitor',  'GET', '/api/v1/assistant/monitor',   token);
  await testEndpoint('Learning Profile',   'GET', '/api/v1/assistant/learning',  token);
  await testEndpoint('Daily Plan',         'GET', '/api/v1/assistant/plan',      token);
  await testEndpoint('Weekly Plan',        'GET', '/api/v1/assistant/plan/weekly',token);
  await testEndpoint('Metrics',            'GET', '/api/v1/assistant/metrics',   token);
  await testEndpoint('Timeline (assistant)','GET','/api/v1/assistant/timeline',  token);
  await testEndpoint('Policy',             'GET', '/api/v1/assistant/policy',    token);
  await testEndpoint('Snapshot',           'GET', '/api/v1/assistant/snapshot',  token);
  await testEndpoint('ML Predictions',     'GET', '/api/v1/assistant/ml-predictions', token);

  // ── Adaptive ─────────────────────────────────────────────────────────────
  console.log('\n── Adaptive ──');
  await testEndpoint('Adaptive Recommendations','GET', '/api/v1/adaptive/adaptive-recommendations', token);
  await testEndpoint('Adaptive Copilot Suggestions','GET','/api/v1/adaptive/copilot/suggestions', token);

  // ── Performance ──────────────────────────────────────────────────────────
  console.log('\n── Performance ──');
  await testEndpoint('Performance Today',  'GET', '/api/v1/performance/today',   token);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  console.log(`   Results: ${passed} PASS, ${failed} FAIL`);
  if (failedEndpoints.length > 0) {
    console.log('\n   Failed Endpoints:');
    failedEndpoints.forEach(e =>
      console.log(`     ❌ ${e.method} ${e.urlPath} → ${e.status}: ${e.body}`)
    );
  }
  console.log('══════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
