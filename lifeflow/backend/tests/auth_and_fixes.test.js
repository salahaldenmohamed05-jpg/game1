/**
 * Auth Flow & Date Field Fix Tests
 * ===================================
 * اختبارات شاملة لتدفق المصادقة وإصلاحات حقول التاريخ
 *
 * Covers:
 *  1. Auth API — register, login, refresh token, profile
 *  2. Response structure validation (data.data nesting)
 *  3. Protected endpoints — 401 without token
 *  4. Date field fixes — MoodEntry.entry_date, ProductivityScore.score_date, Task.createdAt
 *  5. intelligenceAPIv2 alias endpoints
 */

'use strict';

const http = require('http');

// ── Config ─────────────────────────────────────────────────────────────────
const BASE  = 'http://localhost:5000/api/v1';
const EMAIL = `testfix_${Date.now()}@test.com`;
const PASS  = 'testpass123';
const NAME  = 'Test Fix User';

let PASS_COUNT  = 0;
let FAIL_COUNT  = 0;
let AUTH_TOKEN  = null;
let REFRESH_TOK = null;
let USER_ID     = null;

// ── Helpers ────────────────────────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: 'localhost',
      port:     5000,
      path:     '/api/v1' + path,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
      },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function ok(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✅ ${label}`);
    PASS_COUNT++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    FAIL_COUNT++;
  }
}

// ── Test Sections ──────────────────────────────────────────────────────────

async function testRegister() {
  console.log('\n═══ 1. Register ═══');
  const r = await request('POST', '/auth/register', { name: NAME, email: EMAIL, password: PASS });

  ok('register status 201', r.status === 201, `got ${r.status}`);
  ok('register success=true', r.body?.success === true);

  // Validate response structure: { success, message, data: { user, accessToken, refreshToken } }
  const data = r.body?.data;
  ok('response has data object', typeof data === 'object' && data !== null);
  ok('data.accessToken present', typeof data?.accessToken === 'string' && data.accessToken.length > 10);
  ok('data.refreshToken present', typeof data?.refreshToken === 'string' && data.refreshToken.length > 10);
  ok('data.user.email matches', data?.user?.email === EMAIL);
  ok('data.user.name matches', data?.user?.name === NAME);
  ok('data.user has id', typeof data?.user?.id === 'string');
  ok('no password in response', !data?.user?.password && !data?.user?.password_hash);

  // Simulate authStore fix: outer = response.data, payload = outer.data
  const outer   = r.body;         // { success, message, data: { user, accessToken, refreshToken } }
  const payload = outer?.data;    // { user, accessToken, refreshToken }
  ok('authStore fix: accessToken extractable from outer.data', typeof payload?.accessToken === 'string');

  AUTH_TOKEN  = data?.accessToken;
  REFRESH_TOK = data?.refreshToken;
  USER_ID     = data?.user?.id;
}

async function testLogin() {
  console.log('\n═══ 2. Login ═══');
  const r = await request('POST', '/auth/login', { email: EMAIL, password: PASS });

  ok('login status 200', r.status === 200, `got ${r.status}`);
  ok('login success=true', r.body?.success === true);

  const data = r.body?.data;
  ok('login data.accessToken present', typeof data?.accessToken === 'string');
  ok('login data.refreshToken present', typeof data?.refreshToken === 'string');
  ok('login data.user.email correct', data?.user?.email === EMAIL);
  ok('no password_hash in user', !data?.user?.password_hash);

  // Validate the response shape exactly as authStore expects
  const outer   = r.body;
  const payload = outer?.data;
  ok('authStore fix (login): outer.data.accessToken', typeof payload?.accessToken === 'string');
  ok('authStore fix (login): outer.data.user', typeof payload?.user === 'object');

  // Update BOTH tokens with the ones from login (register refresh is now invalidated)
  AUTH_TOKEN  = data?.accessToken;
  REFRESH_TOK = data?.refreshToken;
}

async function testLoginWrongPassword() {
  console.log('\n═══ 3. Login — Wrong Password ═══');
  const r = await request('POST', '/auth/login', { email: EMAIL, password: 'wrongpassword' });

  ok('wrong password → 401', r.status === 401, `got ${r.status}`);
  ok('success=false', r.body?.success === false);
  ok('error message present', typeof r.body?.message === 'string');
}

async function testRefreshToken() {
  console.log('\n═══ 4. Refresh Token ═══');
  if (!REFRESH_TOK) { console.log('  ⚠️ Skipped — no refresh token'); return; }

  const r = await request('POST', '/auth/refresh', { refreshToken: REFRESH_TOK });

  ok('refresh status 200', r.status === 200, `got ${r.status}`);
  ok('refresh success=true', r.body?.success === true);
  ok('refresh data.accessToken present', typeof r.body?.data?.accessToken === 'string');
  ok('refresh data.refreshToken present', typeof r.body?.data?.refreshToken === 'string');

  // Update tokens
  AUTH_TOKEN  = r.body?.data?.accessToken;
  REFRESH_TOK = r.body?.data?.refreshToken;
}

async function testRefreshTokenInvalid() {
  console.log('\n═══ 5. Refresh Token — Invalid ═══');
  const r = await request('POST', '/auth/refresh', { refreshToken: 'invalid.token.here' });

  ok('invalid refresh → 401', r.status === 401, `got ${r.status}`);
  ok('success=false', r.body?.success === false);
}

async function testProtectedEndpoints() {
  console.log('\n═══ 6. Protected Endpoints — No Token ═══');

  const endpoints = [
    '/dashboard',
    '/tasks',
    '/habits',
    '/mood/today',
    '/performance/today',
    '/intelligence/life-score',
    '/intelligence/energy',
    '/intelligence/coach',
    '/adaptive/behavior-profile',
    '/adaptive/ai-coach',
    '/adaptive/global-insights',
    '/adaptive/integrations/status',
  ];

  for (const ep of endpoints) {
    const r = await request('GET', ep);
    ok(`no-token → 401 (${ep})`, r.status === 401, `got ${r.status}`);
  }
}

async function testAuthenticatedProfile() {
  console.log('\n═══ 7. Authenticated Requests ═══');
  if (!AUTH_TOKEN) { console.log('  ⚠️ Skipped — no token'); return; }

  // GET /auth/me (profile)
  const r = await request('GET', '/auth/me', null, AUTH_TOKEN);
  ok('GET /auth/me → 200', r.status === 200, `got ${r.status}`);
  ok('profile success=true', r.body?.success === true);
  ok('profile data.email matches', r.body?.data?.email === EMAIL);

  // GET /dashboard — authenticated
  const dash = await request('GET', '/dashboard', null, AUTH_TOKEN);
  ok('GET /dashboard → 200', dash.status === 200, `got ${dash.status}`);
  ok('dashboard success=true', dash.body?.success === true);
  ok('dashboard has greeting', typeof dash.body?.data?.greeting === 'string');
  ok('dashboard has summary', typeof dash.body?.data?.summary === 'object');
}

async function testDateFieldEndpoints() {
  console.log('\n═══ 8. Date Field Fix — Intelligence Endpoints ═══');
  if (!AUTH_TOKEN) { console.log('  ⚠️ Skipped — no token'); return; }

  // These were failing with MoodEntry.created_at / ProductivityScore.date errors
  const endpoints = [
    { path: '/intelligence/life-score', label: 'life-score (score_date fix)' },
    { path: '/intelligence/timeline',   label: 'timeline (entry_date fix)' },
    { path: '/intelligence/burnout-risk', label: 'burnout-risk' },
    { path: '/intelligence/trajectory',  label: 'trajectory' },
    { path: '/intelligence/energy',      label: 'energy (entry_date fix)' },
    { path: '/intelligence/focus-windows', label: 'focus-windows' },
    { path: '/intelligence/coach',       label: 'coach (entry_date fix)' },
    { path: '/performance/today',        label: 'performance/today (entry_date fix)' },
    { path: '/adaptive/behavior-profile', label: 'behavior-profile (pattern.learning fix)' },
    { path: '/adaptive/patterns',        label: 'patterns (score_date fix)' },
    { path: '/adaptive/recommendations', label: 'adaptive recommendations' },
    { path: '/adaptive/global-insights', label: 'global-insights' },
    { path: '/adaptive/benchmark',       label: 'benchmark (entry_date fix)' },
    { path: '/adaptive/global-trends',   label: 'global-trends' },
    { path: '/adaptive/integrations/status', label: 'integrations/status' },
    { path: '/adaptive/context/today',   label: 'context/today' },
  ];

  for (const { path, label } of endpoints) {
    const r = await request('GET', path, null, AUTH_TOKEN);
    ok(`${label} → 200`, r.status === 200, `got ${r.status}`);
    ok(`${label} → success`, r.body?.success === true, JSON.stringify(r.body).slice(0, 80));
  }
}

async function testPerformanceEndpoints() {
  console.log('\n═══ 9. Performance & Weekly Audit ═══');
  if (!AUTH_TOKEN) { console.log('  ⚠️ Skipped — no token'); return; }

  const r1 = await request('GET', '/performance/dashboard', null, AUTH_TOKEN);
  ok('performance/dashboard → 200', r1.status === 200, `got ${r1.status}`);

  const r2 = await request('GET', '/performance/weekly-audit', null, AUTH_TOKEN);
  ok('performance/weekly-audit → 200', r2.status === 200, `got ${r2.status}`);

  const r3 = await request('GET', '/performance/energy-profile', null, AUTH_TOKEN);
  ok('performance/energy-profile → 200', r3.status === 200, `got ${r3.status}`);

  const r4 = await request('POST', '/performance/compute', null, AUTH_TOKEN);
  ok('performance/compute → 200', r4.status === 200, `got ${r4.status}`);
}

async function testAdaptivePhases() {
  console.log('\n═══ 10. Adaptive Phases (10-14) ═══');
  if (!AUTH_TOKEN) { console.log('  ⚠️ Skipped — no token'); return; }

  // Phase 11 — Copilot
  const coach = await request('GET', '/adaptive/ai-coach', null, AUTH_TOKEN);
  ok('ai-coach → 200', coach.status === 200, `got ${coach.status}`);
  ok('ai-coach success', coach.body?.success === true);

  const plan = await request('GET', '/adaptive/daily-plan', null, AUTH_TOKEN);
  ok('daily-plan → 200', plan.status === 200, `got ${plan.status}`);

  const conv = await request('POST', '/adaptive/conversation', { message: 'كيف حالك؟' }, AUTH_TOKEN);
  ok('conversation → 200', conv.status === 200, `got ${conv.status}`);
  ok('conversation has reply', typeof conv.body?.data?.reply === 'string');

  // Phase 12 — Optimizer
  const goals = await request('GET', '/adaptive/goals', null, AUTH_TOKEN);
  ok('goals → 200', goals.status === 200, `got ${goals.status}`);

  const goalCreate = await request('POST', '/adaptive/goals', {
    title: 'Test Goal', target_date: '2026-06-01', category: 'health'
  }, AUTH_TOKEN);
  ok('create goal → 201', goalCreate.status === 201, `got ${goalCreate.status}`);
  ok('goal has id', typeof goalCreate.body?.data?.id === 'string');

  const opt = await request('GET', '/adaptive/life-optimizer', null, AUTH_TOKEN);
  ok('life-optimizer → 200', opt.status === 200, `got ${opt.status}`);

  const sched = await request('GET', '/adaptive/schedule-adjustment', null, AUTH_TOKEN);
  ok('schedule-adjustment → 200', sched.status === 200, `got ${sched.status}`);

  // Phase 14 — Integrations
  const avail = await request('GET', '/adaptive/integrations/available', null, AUTH_TOKEN);
  ok('integrations/available → 200', avail.status === 200, `got ${avail.status}`);
}

async function testIntelligencePlanDay() {
  console.log('\n═══ 11. Plan Day (intelligenceAPIv2) ═══');
  if (!AUTH_TOKEN) { console.log('  ⚠️ Skipped — no token'); return; }

  const r = await request('POST', '/intelligence/plan-day', {}, AUTH_TOKEN);
  ok('plan-day → 200', r.status === 200, `got ${r.status}`);
  ok('plan-day success', r.body?.success === true);
  ok('plan-day has schedule', Array.isArray(r.body?.data?.schedule));
  ok('plan-day has stats', typeof r.body?.data?.stats === 'object');
}

async function testLogout() {
  console.log('\n═══ 12. Logout ═══');
  if (!AUTH_TOKEN) { console.log('  ⚠️ Skipped — no token'); return; }

  const r = await request('POST', '/auth/logout', null, AUTH_TOKEN);
  ok('logout → 200', r.status === 200, `got ${r.status}`);
  ok('logout success', r.body?.success === true);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     Auth Flow & Date Fix Tests — LifeFlow API           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    await testRegister();
    await testLogin();
    await testLoginWrongPassword();
    await testRefreshToken();
    await testRefreshTokenInvalid();
    await testProtectedEndpoints();
    await testAuthenticatedProfile();
    await testDateFieldEndpoints();
    await testPerformanceEndpoints();
    await testAdaptivePhases();
    await testIntelligencePlanDay();
    await testLogout();
  } catch (err) {
    console.error('Fatal test error:', err.message);
    FAIL_COUNT++;
  }

  const total = PASS_COUNT + FAIL_COUNT;
  const pct   = total > 0 ? Math.round((PASS_COUNT / total) * 100) : 0;

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ Passed: ${PASS_COUNT}  ❌ Failed: ${FAIL_COUNT}  📊 Total: ${total}  📈 ${pct}%`);

  if (FAIL_COUNT === 0) {
    console.log('\n🎉 All auth & fix tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed — check output above.');
    process.exit(1);
  }
}

main();
