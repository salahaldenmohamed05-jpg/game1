/**
 * Phase 9-12 Integration Tests
 * ==============================
 * Tests energy score, focus windows, AI coach, and day planner endpoints.
 * Registers a fresh user → starts trial → runs all feature checks → regression.
 */
const axios = require('axios');
const BASE   = 'http://localhost:5000/api/v1';
let token = '';
let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}`); failed++; }
}

async function safeGet(url, headers) {
  try { return await axios.get(url, headers); }
  catch (e) { return e.response || { status: 500, data: {} }; }
}

async function safePost(url, body, headers) {
  try { return await axios.post(url, body, headers); }
  catch (e) { return e.response || { status: 500, data: {} }; }
}

async function setup() {
  const ts  = Date.now();
  const reg = await axios.post(`${BASE}/auth/register`, {
    name: 'P9 Tester',
    email: `p9_${ts}@test.com`,
    password: 'Test1234!',
  });
  token = reg.data.data?.accessToken || reg.data.accessToken;
  const h = { headers: { Authorization: `Bearer ${token}` } };

  // Start trial so premium features are accessible
  const trial = await safePost(`${BASE}/subscription/trial`, {}, h);
  console.log(`  🎯 Trial: ${trial.data?.success ? 'started' : trial.data?.message}`);

  // Seed: mood check-in
  await safePost(`${BASE}/mood/check-in`, { mood_score: 7, energy_level: 8, stress_level: 3 }, h);

  // Seed: habit + check-in
  const hr = await safePost(`${BASE}/habits`, {
    name: 'قراءة',
    category: 'learning',
    frequency: 'daily',
    target_time: '08:00',
  }, h);
  const hid = hr.data?.data?.id;
  if (hid) await safePost(`${BASE}/habits/${hid}/check-in`, { completed: true }, h);

  // Seed: tasks
  await safePost(`${BASE}/tasks`, { title: 'مهمة عاجلة', priority: 'urgent', estimated_duration: 45 }, h);
  await safePost(`${BASE}/tasks`, { title: 'مهمة متوسطة', priority: 'medium', estimated_duration: 30 }, h);

  console.log(`\n🔐 Setup done\n`);
}

async function run() {
  console.log('\n🚀 Phase 9-12 Integration Tests\n' + '='.repeat(50));
  await setup();
  const h = { headers: { Authorization: `Bearer ${token}` } };

  // ── Energy Score ───────────────────────────────────────────────────────────
  console.log('─── Energy Score ───');
  const e = await safeGet(`${BASE}/intelligence/energy`, h);
  ok('HTTP 200',           e.status === 200);
  ok('success:true',       e.data.success === true);
  ok('energy_score 0-100', typeof e.data.data?.energy_score === 'number' &&
                           e.data.data.energy_score >= 0 && e.data.data.energy_score <= 100);
  ok('has level',          ['high','medium','low','critical'].includes(e.data.data?.level));
  ok('has level_label',    typeof e.data.data?.level_label === 'string');
  ok('has breakdown',      typeof e.data.data?.breakdown === 'object');
  ok('breakdown.sleep_score exists',  e.data.data?.breakdown?.sleep_score !== undefined);
  ok('breakdown.mood_score exists',   e.data.data?.breakdown?.mood_score  !== undefined);
  ok('breakdown.habit_score exists',  e.data.data?.breakdown?.habit_score !== undefined);
  ok('has focus_windows',  Array.isArray(e.data.data?.focus_windows));
  ok('has tips',           Array.isArray(e.data.data?.tips));
  if (e.data.data) console.log(`  score=${e.data.data.energy_score}, level=${e.data.data.level}`);

  // ── Focus Windows ──────────────────────────────────────────────────────────
  console.log('─── Focus Windows ───');
  const fw = await safeGet(`${BASE}/intelligence/focus-windows`, h);
  ok('HTTP 200',           fw.status === 200);
  ok('success:true',       fw.data.success === true);
  ok('has focus_windows',  Array.isArray(fw.data.data?.focus_windows));

  // ── Coach Insights ─────────────────────────────────────────────────────────
  console.log('─── Coach Insights ───');
  const c = await safeGet(`${BASE}/intelligence/coach`, h);
  ok('HTTP 200',              c.status === 200);
  ok('success:true',          c.data.success === true);
  ok('has summary',           typeof c.data.data?.summary === 'object');
  ok('summary.avg_score_14d', typeof c.data.data?.summary?.avg_score_14d === 'number');
  ok('has burnout_warning',   typeof c.data.data?.burnout_warning === 'object');
  ok('risk_level valid',      ['high','medium','low'].includes(c.data.data?.burnout_warning?.risk_level));
  ok('has risk_score',        typeof c.data.data?.burnout_warning?.risk_score === 'number');
  ok('has recommendations',   Array.isArray(c.data.data?.recommendations));
  ok('recs >= 1',             (c.data.data?.recommendations?.length ?? 0) >= 1);
  ok('has life_balance',      typeof c.data.data?.life_balance === 'object');
  ok('has action_plan',       Array.isArray(c.data.data?.action_plan));
  ok('has highlights',        Array.isArray(c.data.data?.highlights));
  if (c.data.data) console.log(`  burnout=${c.data.data.burnout_warning.risk_level}, recs=${c.data.data.recommendations.length}`);

  // ── Day Planner ────────────────────────────────────────────────────────────
  console.log('─── Day Planner ───');
  const p = await safePost(`${BASE}/intelligence/plan-day`, {}, h);
  ok('HTTP 200',             p.status === 200);
  ok('success:true',         p.data.success === true);
  ok('has schedule',         Array.isArray(p.data.data?.schedule));
  ok('schedule not empty',   (p.data.data?.schedule?.length ?? 0) > 0);
  ok('has focus_windows',    Array.isArray(p.data.data?.focus_windows));
  ok('has stats',            typeof p.data.data?.stats === 'object');
  ok('stats.scheduled_tasks', typeof p.data.data?.stats?.scheduled_tasks === 'number');
  ok('stats.energy_match_score', typeof p.data.data?.stats?.energy_match_score === 'number');
  ok('stats.estimated_work_minutes', typeof p.data.data?.stats?.estimated_work_minutes === 'number');
  ok('has energy_curve',     Array.isArray(p.data.data?.energy_curve));
  ok('has warnings array',   Array.isArray(p.data.data?.warnings));
  if (p.data.data?.schedule?.length > 0) {
    const b = p.data.data.schedule[0];
    ok('blocks have time_label', typeof b.time_label === 'string');
    ok('blocks have type',       typeof b.type       === 'string');
    ok('blocks have title',      typeof b.title      === 'string');
    ok('blocks have duration',   typeof b.duration   === 'number');
    const sorted = p.data.data.schedule.every((blk, i, a) => i === 0 || blk.hour >= a[i-1].hour);
    ok('schedule sorted by hour', sorted);
  }
  // Specific date
  const p2 = await safePost(`${BASE}/intelligence/plan-day`, { date: '2026-03-15' }, h);
  ok('specific date works',  p2.data.success === true);
  ok('date matches request', p2.data.data?.date === '2026-03-15');
  if (p.data.data) console.log(`  blocks=${p.data.data.schedule.length}, match=${p.data.data.stats.energy_match_score}%`);

  // ── Regression ─────────────────────────────────────────────────────────────
  console.log('─── Regression (existing endpoints) ───');
  const ls = await safeGet(`${BASE}/intelligence/life-score`, h);
  ok('life-score 200',     ls.status === 200);
  ok('life-score success', ls.data.success === true);

  const tl = await safeGet(`${BASE}/intelligence/timeline`, h);
  ok('timeline 200',       tl.status === 200);

  const br = await safeGet(`${BASE}/intelligence/burnout-risk`, h);
  ok('burnout-risk 200',   br.status === 200);

  const tr = await safeGet(`${BASE}/intelligence/trajectory`, h);
  ok('trajectory 200',     tr.status === 200);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  console.log('─── Auth Guard ───');
  const noAuth = await safeGet(`${BASE}/intelligence/energy`, {});
  ok('no-token → 401',     noAuth.status === 401);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  const total = passed + failed;
  const pct   = Math.round((passed / total) * 100);
  console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}  📊 Total: ${total}  📈 ${pct}%`);
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check output above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('FATAL:', err.response?.data || err.message);
  process.exit(1);
});
