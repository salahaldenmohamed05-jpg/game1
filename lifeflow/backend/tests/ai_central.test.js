/**
 * AI Central Layer — Integration Tests
 * ======================================
 * Tests:
 *   1. GET  /api/v1/ai/v2/status            — no auth required
 *   2. POST /api/v1/ai/v2/coach             — requires auth, returns fallback if no AI key
 *   3. POST /api/v1/ai/v2/insight           — requires auth
 *   4. POST /api/v1/ai/v2/planner           — requires auth
 *   5. Unauthenticated requests return 401
 *   6. Existing APIs still return 200
 *   7. Provider fallback: invalid keys → graceful fallback response
 */

'use strict';

const http = require('http');

const BASE    = 'http://localhost:5000/api/v1';
const AI_BASE = `${BASE}/ai/v2`;

let accessToken = '';
let testsPassed = 0;
let testsFailed = 0;

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
function request(method, url, body = null, token = '') {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname : u.hostname,
      port     : u.port || 80,
      path     : u.pathname,
      method,
      headers  : { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, label, extra = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    testsPassed++;
  } else {
    console.error(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
    testsFailed++;
  }
}

// ─── Test suites ─────────────────────────────────────────────────────────────

async function testStatus() {
  console.log('\n📡 [1] GET /ai/v2/status (no auth)');
  const { status, body } = await request('GET', `${AI_BASE}/status`);
  assert(status === 200, 'HTTP 200', `got ${status}`);
  assert(body.success === true, 'success = true');
  assert(body.data && 'status' in body.data, 'has data.status field');
  assert(body.data && 'provider' in body.data, 'has data.provider field');
  assert(body.data && 'keys' in body.data, 'has data.keys object');
  assert(typeof body.data.ready === 'boolean', 'has data.ready boolean');
  console.log(`  ℹ️  Provider: ${body.data.provider}, Status: ${body.data.status}`);
}

async function doLogin() {
  console.log('\n🔑 Registering test user for AI tests…');
  const ts   = Date.now();
  const email = `ai_test_${ts}@test.com`;

  const { body } = await request('POST', `${BASE}/auth/register`, {
    name: 'AI Test User', email, password: 'Test1234!', timezone: 'Africa/Cairo',
  });

  accessToken = body.data?.accessToken;
  assert(!!accessToken, 'Got access token');
  return accessToken;
}

async function testUnauthenticated() {
  console.log('\n🔒 [2] Unauthenticated requests → 401');
  for (const [method, path, body] of [
    ['POST', '/coach',   { energy_score: 70 }],
    ['POST', '/insight', {}],
    ['POST', '/planner', {}],
  ]) {
    const { status } = await request(method, `${AI_BASE}${path}`, body, '');
    assert(status === 401, `${method} ${path} → 401`, `got ${status}`);
  }
}

async function testCoach() {
  console.log('\n🤖 [3] POST /ai/v2/coach (with auth)');
  const { status, body } = await request('POST', `${AI_BASE}/coach`, {
    energy_score  : 72,
    life_score    : 65,
    tasks_overdue : 2,
    mood_trend    : 'stable',
  }, accessToken);

  assert(status === 200, 'HTTP 200', `got ${status}`);
  assert(body.success === true, 'success = true');
  assert(body.data && 'insight' in body.data, 'has insight field');
  assert(body.data && 'recommendation' in body.data, 'has recommendation field');
  assert(body.data && 'provider' in body.data, 'has provider field');
  // Fallback must be a non-empty string
  assert(typeof body.data.insight === 'string' && body.data.insight.length > 0, 'insight is non-empty string');
  console.log(`  ℹ️  Provider used: ${body.data.provider}`);
  console.log(`  ℹ️  Insight: ${body.data.insight.slice(0, 80)}…`);
}

async function testInsight() {
  console.log('\n🧠 [4] POST /ai/v2/insight (with auth)');
  const { status, body } = await request('POST', `${AI_BASE}/insight`, {
    habit_streaks   : [{ name: 'رياضة', streak: 5 }, { name: 'قراءة', streak: 3 }],
    timeline_events : [{ title: 'اجتماع مهم', type: 'meeting' }],
    mood_history    : [{ mood_score: 7 }, { mood_score: 8 }, { mood_score: 6 }],
    energy_data     : [{ energy_score: 70 }, { energy_score: 65 }],
    period_days     : 7,
  }, accessToken);

  assert(status === 200, 'HTTP 200', `got ${status}`);
  assert(body.success === true, 'success = true');
  assert(body.data && 'behavior_insights' in body.data, 'has behavior_insights field');
  assert(body.data && Array.isArray(body.data.patterns_detected), 'patterns_detected is array');
  assert(body.data && Array.isArray(body.data.suggestions), 'suggestions is array');
  assert(body.data && 'trend_summary' in body.data, 'has trend_summary field');
  console.log(`  ℹ️  Provider used: ${body.data.provider}`);
}

async function testPlanner() {
  console.log('\n📅 [5] POST /ai/v2/planner (with auth)');
  const { status, body } = await request('POST', `${AI_BASE}/planner`, {
    tasks : [
      { title: 'كتابة التقرير الأسبوعي', priority: 'high' },
      { title: 'مراجعة البريد الإلكتروني', priority: 'normal' },
      { title: 'تحضير العرض التقديمي', priority: 'urgent' },
    ],
    energy_predictions : { morning: 80, afternoon: 60, evening: 40 },
    focus_windows      : [{ start: '09:00', end: '11:00', quality: 'عالي' }],
    habits             : [{ name: 'تأمل', frequency: 'يومي' }],
    date               : '2026-03-16',
  }, accessToken);

  assert(status === 200, 'HTTP 200', `got ${status}`);
  assert(body.success === true, 'success = true');
  assert(body.data && Array.isArray(body.data.morning_plan), 'morning_plan is array');
  assert(body.data && Array.isArray(body.data.afternoon_plan), 'afternoon_plan is array');
  assert(body.data && Array.isArray(body.data.evening_plan), 'evening_plan is array');
  assert(body.data && Array.isArray(body.data.priority_tasks), 'priority_tasks is array');
  assert(body.data && typeof body.data.focus_tip === 'string', 'focus_tip is string');
  assert(body.data && typeof body.data.daily_summary === 'string', 'daily_summary is string');
  console.log(`  ℹ️  Provider used: ${body.data.provider}`);
  console.log(`  ℹ️  Focus tip: ${body.data.focus_tip?.slice(0, 80)}…`);
}

async function testExistingAPIs() {
  console.log('\n🔗 [6] Existing APIs still return 200');
  const endpoints = [
    ['GET', `${BASE}/dashboard`],
    ['GET', `${BASE}/tasks`],
    ['GET', `${BASE}/habits/today-summary`],
    ['GET', `${BASE}/mood/today`],
    ['GET', `${BASE}/performance/dashboard`],
    ['GET', `${BASE}/intelligence/life-score`],
    ['GET', `${BASE}/intelligence/burnout-risk`],
    ['GET', `${BASE}/adaptive/behavior-profile`],
  ];
  for (const [method, url] of endpoints) {
    const { status } = await request(method, url, null, accessToken);
    const path = url.replace(BASE, '');
    assert(status === 200, `${method} ${path} → 200`, `got ${status}`);
  }
}

async function testProviderFallback() {
  console.log('\n⚡ [7] Provider fallback — placeholder keys → graceful fallback response');
  // Already running with placeholder keys, so all AI calls should return fallback data, not 500
  const { status, body } = await request('POST', `${AI_BASE}/coach`, {
    energy_score: 50, life_score: 50, tasks_overdue: 0, mood_trend: 'stable',
  }, accessToken);

  assert(status === 200, 'Returns 200 (not 500) on no-key scenario', `got ${status}`);
  assert(body.data?.provider === 'fallback', 'provider = "fallback"', `got ${body.data?.provider}`);
  assert(typeof body.data?.insight === 'string', 'insight is non-empty string');
  console.log(`  ℹ️  Fallback insight: "${body.data?.insight}"`);
}

// ─── Main runner ──────────────────────────────────────────────────────────────
(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('  AI CENTRAL LAYER — INTEGRATION TEST SUITE');
  console.log('═══════════════════════════════════════════════════');

  try {
    await testStatus();
    await doLogin();
    await testUnauthenticated();
    await testCoach();
    await testInsight();
    await testPlanner();
    await testExistingAPIs();
    await testProviderFallback();
  } catch (err) {
    console.error('\n💥 Fatal test error:', err.message);
    testsFailed++;
  }

  const total = testsPassed + testsFailed;
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${testsPassed}/${total} passed, ${testsFailed} failed`);
  console.log(testsFailed === 0 ? '  🎉 ALL TESTS PASSED — 100% success' : `  ⚠️  ${testsFailed} TESTS FAILED`);
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(testsFailed > 0 ? 1 : 0);
})();
