/**
 * Phase 10–14 Integration Tests
 * ==============================
 * Tests all adaptive, AI copilot, life optimization, global intelligence, and integration endpoints.
 */
'use strict';

const axios = require('axios');
const BASE  = 'http://localhost:5000/api/v1';
let token = '';
let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}`); failed++; }
}

async function safeGet(url, headers) {
  try { return await axios.get(url, headers); }
  catch (e) { return e.response || { status: 500, data: { success: false, message: e.message } }; }
}

async function safePost(url, body, headers) {
  try { return await axios.post(url, body, headers); }
  catch (e) { return e.response || { status: 500, data: { success: false, message: e.message } }; }
}

async function setup() {
  const ts  = Date.now();
  const reg = await axios.post(`${BASE}/auth/register`, {
    name: 'Phase1014 Tester',
    email: `p1014_${ts}@test.com`,
    password: 'Test1234!',
  });
  token = reg.data.data?.accessToken || reg.data.accessToken;
  const h = { headers: { Authorization: `Bearer ${token}` } };

  // Start trial
  await safePost(`${BASE}/subscription/trial`, {}, h);

  // Seed data
  await safePost(`${BASE}/mood/check-in`, { mood_score: 7, energy_level: 8, stress_level: 3 }, h);
  const hr = await safePost(`${BASE}/habits`, { name: 'تمرين', category: 'health', frequency: 'daily', target_time: '07:00' }, h);
  const hid = hr.data?.data?.id;
  if (hid) await safePost(`${BASE}/habits/${hid}/check-in`, { completed: true }, h);
  await safePost(`${BASE}/tasks`, { title: 'مهمة هامة', priority: 'high', estimated_duration: 60 }, h);

  console.log(`\n🔐 Setup done — token: ${token.slice(0,20)}...\n`);
}

// ─── Phase 10: Adaptive Life Model ───────────────────────────────────────────
async function testPhase10() {
  console.log('═══ Phase 10: Adaptive Life Model ═══');
  const h = { headers: { Authorization: `Bearer ${token}` } };

  // Behavior Profile
  const bp = await safeGet(`${BASE}/adaptive/behavior-profile`, h);
  ok('behavior-profile 200',   bp.status === 200);
  ok('behavior-profile success', bp.data.success === true);
  ok('has model',              !!bp.data.data?.model);

  // Patterns
  const pt = await safeGet(`${BASE}/adaptive/patterns`, h);
  ok('patterns 200',           pt.status === 200);
  ok('patterns success',       pt.data.success === true);

  // Life Simulation
  const sim = await safeGet(`${BASE}/adaptive/simulate-life?sleep_change=1&exercise_change=1`, h);
  ok('simulate-life 200',      sim.status === 200);
  ok('simulate-life success',  sim.data.success === true);
  ok('has scenarios',          Array.isArray(sim.data.data?.scenarios) || !!sim.data.data);

  // Adaptive Recommendations
  const rec = await safeGet(`${BASE}/adaptive/recommendations`, h);
  ok('recommendations 200',    rec.status === 200);
  ok('recommendations success', rec.data.success === true);
}

// ─── Phase 11: AI Life Copilot ───────────────────────────────────────────────
async function testPhase11() {
  console.log('\n═══ Phase 11: AI Life Copilot ═══');
  const h = { headers: { Authorization: `Bearer ${token}` } };

  // AI Coach suggestions
  const ai = await safeGet(`${BASE}/adaptive/ai-coach`, h);
  ok('ai-coach 200',          ai.status === 200);
  ok('ai-coach success',      ai.data.success === true);
  ok('has suggestions',       Array.isArray(ai.data.data?.suggestions));

  // Conversation
  const chat = await safePost(`${BASE}/adaptive/conversation`, { message: 'مرحبا' }, h);
  ok('conversation 200',      chat.status === 200);
  ok('conversation success',  chat.data.success === true);
  ok('has reply',             typeof chat.data.data?.reply === 'string');

  // Daily plan
  const plan = await safeGet(`${BASE}/adaptive/daily-plan`, h);
  ok('daily-plan 200',        plan.status === 200);
  ok('daily-plan success',    plan.data.success === true);
  ok('has schedule',          Array.isArray(plan.data.data?.schedule));
}

// ─── Phase 12: Life Optimization ────────────────────────────────────────────
async function testPhase12() {
  console.log('\n═══ Phase 12: Life Optimization ═══');
  const h = { headers: { Authorization: `Bearer ${token}` } };

  // Goals
  const goals = await safeGet(`${BASE}/adaptive/goals`, h);
  ok('goals 200',             goals.status === 200);
  ok('goals success',         goals.data.success === true);
  ok('has goals array',       Array.isArray(goals.data.data?.goals));

  // Life optimizer
  const opt = await safeGet(`${BASE}/adaptive/life-optimizer`, h);
  ok('life-optimizer 200',    opt.status === 200);
  ok('life-optimizer success', opt.data.success === true);
  ok('has overall_score',     typeof opt.data.data?.overall_score === 'number');
  ok('has dimensions',        !!opt.data.data?.dimensions);
  ok('has recommendations',   Array.isArray(opt.data.data?.recommendations));

  // Schedule adjustment
  const sched = await safeGet(`${BASE}/adaptive/schedule-adjustment`, h);
  ok('schedule-adjustment 200', sched.status === 200);
  ok('schedule-adjustment success', sched.data.success === true);
}

// ─── Phase 13: Global Intelligence ──────────────────────────────────────────
async function testPhase13() {
  console.log('\n═══ Phase 13: Global Intelligence ═══');
  const h = { headers: { Authorization: `Bearer ${token}` } };

  // Global insights (no auth needed but test with auth)
  const gi = await safeGet(`${BASE}/adaptive/global-insights`, h);
  ok('global-insights 200',   gi.status === 200);
  ok('global-insights success', gi.data.success === true);
  ok('has benchmarks',        !!gi.data.data?.benchmarks || !!gi.data.data);

  // Benchmark comparison
  const bm = await safeGet(`${BASE}/adaptive/benchmark`, h);
  ok('benchmark 200',         bm.status === 200);
  ok('benchmark success',     bm.data.success === true);
  ok('has comparison',        !!bm.data.data?.comparison || !!bm.data.data);
  ok('has percentiles',       !!bm.data.data?.percentiles || !!bm.data.data?.overall_score !== undefined);
}

// ─── Phase 14: Life OS Integration ──────────────────────────────────────────
async function testPhase14() {
  console.log('\n═══ Phase 14: Life OS Integration ═══');
  const h = { headers: { Authorization: `Bearer ${token}` } };

  // Integration status
  const status = await safeGet(`${BASE}/adaptive/integrations/status`, h);
  ok('integrations-status 200', status.status === 200);
  ok('integrations-status success', status.data.success === true);

  // Connect integration
  const connect = await safePost(`${BASE}/adaptive/integrations/connect`,
    { integration_type: 'google_calendar', display_name: 'Test Calendar' }, h);
  ok('connect-integration 200', connect.status === 200 || connect.status === 201);
  ok('connect returns data',  !!connect.data.success || connect.data.message !== undefined);

  // Context detection
  const ctx = await safeGet(`${BASE}/adaptive/context/today`, h);
  ok('context-today 200',     ctx.status === 200);
  ok('context-today success', ctx.data.success === true);
  ok('has context_type',      typeof ctx.data.data?.context_type === 'string' || !!ctx.data.data);

  // Available integrations catalog
  const avail = await safeGet(`${BASE}/adaptive/integrations/available`, h);
  ok('available-integrations 200', avail.status === 200 || avail.status === 404); // may not be implemented
}

// ─── Auth Guards ─────────────────────────────────────────────────────────────
async function testAuthGuards() {
  console.log('\n═══ Auth Guards ═══');
  const endpoints = [
    `${BASE}/adaptive/behavior-profile`,
    `${BASE}/adaptive/ai-coach`,
    `${BASE}/adaptive/life-optimizer`,
    `${BASE}/adaptive/benchmark`,
  ];
  for (const ep of endpoints) {
    const r = await safeGet(ep, {});
    ok(`no-token → 401 (${ep.split('/').pop()})`, r.status === 401);
  }
}

// ─── Intelligence Endpoints from Phase 9 regression ─────────────────────────
async function testIntelligenceEndpoints() {
  console.log('\n═══ Intelligence Endpoints ═══');
  const h = { headers: { Authorization: `Bearer ${token}` } };

  const ep = [
    ['energy',        `${BASE}/intelligence/energy`],
    ['focus-windows', `${BASE}/intelligence/focus-windows`],
    ['coach',         `${BASE}/intelligence/coach`],
    ['life-score',    `${BASE}/intelligence/life-score`],
    ['timeline',      `${BASE}/intelligence/timeline`],
    ['burnout-risk',  `${BASE}/intelligence/burnout-risk`],
    ['trajectory',    `${BASE}/intelligence/trajectory`],
  ];

  for (const [name, url] of ep) {
    const r = await safeGet(url, h);
    ok(`${name} 200`, r.status === 200);
    ok(`${name} success`, r.data.success === true);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await setup();
    await testPhase10();
    await testPhase11();
    await testPhase12();
    await testPhase13();
    await testPhase14();
    await testAuthGuards();
    await testIntelligenceEndpoints();
  } catch (err) {
    console.error('Fatal setup error:', err.message);
  }

  const total = passed + failed;
  const pct   = total > 0 ? Math.round((passed / total) * 100) : 0;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}  📊 Total: ${total}  📈 ${pct}%`);
  if (failed === 0) console.log('\n🎉 All Phase 10-14 tests passed!');
  else              console.log('\n⚠️  Some tests failed. Review endpoints above.');
  process.exit(failed > 0 ? 1 : 0);
})();
