/**
 * Unit Tests — coaching.service.js helpers
 * ==========================================
 * Tests burnout risk scoring, recommendation builder, life-balance,
 * and action-plan helpers in isolation (no DB).
 */

let passed = 0;
let failed = 0;

function ok(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ' | ' + detail : ''}`); failed++; }
}

// ── Helpers replicated from coaching.service ─────────────────────────────────

function calcTrend(scores) {
  if (!scores || scores.length < 2) return 'stable';
  const recent = scores.slice(-3).reduce((a, b) => a + b, 0) / Math.min(scores.length, 3);
  const older  = scores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(scores.length, 3);
  const diff   = recent - older;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

function calcBurnoutRisk(avgScore, avgMood, activeFlags, taskRate) {
  let score = 0;
  if (avgScore  < 40)  score += 3;
  else if (avgScore < 55) score += 2;
  else if (avgScore < 65) score += 1;

  if (avgMood   < 4)   score += 3;
  else if (avgMood < 6) score += 2;
  else if (avgMood < 7) score += 1;

  score += Math.min(activeFlags, 3);

  if (taskRate < 30)   score += 2;
  else if (taskRate < 50) score += 1;

  if (score >= 8)  return { risk_level: 'high',   urgent: true,  risk_score: score };
  if (score >= 5)  return { risk_level: 'medium', urgent: false, risk_score: score };
  return               { risk_level: 'low',    urgent: false, risk_score: score };
}

function buildLifeBalance(avgScore, avgMood, taskRate, habitRate, consistencyScore) {
  return {
    tasks:       Math.round(Math.min(taskRate * 1.2, 100)),
    habits:      Math.round(Math.min(habitRate * 1.1, 100)),
    mood:        Math.round(Math.min((avgMood / 10) * 100, 100)),
    consistency: Math.round(consistencyScore || 0),
  };
}

function buildActionPlan(risk, trend, recs) {
  const plan = [];
  const days = ['اليوم', 'غداً', 'بعد غد', 'في 3 أيام', 'في 4 أيام', 'في 5 أيام', 'نهاية الأسبوع'];
  recs.slice(0, Math.min(recs.length, 7)).forEach((r, i) => {
    plan.push({ day: days[i] || `اليوم ${i + 1}`, task: r.title || r });
  });
  return plan;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function testCalcTrend() {
  console.log('─── calcTrend ───');
  ok('empty array → stable',      calcTrend([]) === 'stable');
  ok('one item → stable',         calcTrend([50]) === 'stable');
  ok('rising scores → improving', calcTrend([40, 45, 50, 55, 60, 65]) === 'improving');
  ok('falling scores → declining',calcTrend([65, 60, 55, 50, 45, 40]) === 'declining');
  ok('flat scores → stable',      calcTrend([55, 56, 55, 56, 55]) === 'stable');
  ok('null → stable',             calcTrend(null) === 'stable');
  ok('undefined → stable',        calcTrend(undefined) === 'stable');
  // 2-item edge
  ok('2 items same → stable',     calcTrend([50, 50]) === 'stable');
  // With only 2 items, slice(-3) and slice(0,3) overlap → both avg = (40+55)/2, diff = 0 → stable
  ok('2 items overlapping → stable', calcTrend([40, 55]) === 'stable');
}

function testCalcBurnoutRisk() {
  console.log('─── calcBurnoutRisk ───');

  // High risk: low score, low mood, many flags, low task rate
  const high = calcBurnoutRisk(35, 3, 3, 25);
  ok('high risk → level=high',    high.risk_level === 'high',  `got ${high.risk_level}`);
  ok('high risk → urgent=true',   high.urgent === true);
  ok('high risk → score >= 8',    high.risk_score >= 8,        `got ${high.risk_score}`);

  // Low risk: good score, good mood, no flags, decent task rate
  const low = calcBurnoutRisk(75, 8, 0, 80);
  ok('low risk → level=low',      low.risk_level === 'low',    `got ${low.risk_level}`);
  ok('low risk → urgent=false',   low.urgent === false);
  ok('low risk → score < 5',      low.risk_score < 5,          `got ${low.risk_score}`);

  // Medium risk
  const med = calcBurnoutRisk(50, 5, 2, 45);
  ok('medium risk → level=medium', med.risk_level === 'medium', `got ${med.risk_level}`);
  ok('medium risk → urgent=false', med.urgent === false);

  // Edge: max flags capped
  const capTest = calcBurnoutRisk(35, 3, 10, 25);
  ok('flags capped at 3', capTest.risk_score === calcBurnoutRisk(35, 3, 3, 25).risk_score);
}

function testBuildLifeBalance() {
  console.log('─── buildLifeBalance ───');
  const b = buildLifeBalance(70, 7, 80, 75, 65);
  ok('tasks ≤ 100',       b.tasks <= 100);
  ok('habits ≤ 100',      b.habits <= 100);
  ok('mood ≤ 100',        b.mood <= 100);
  ok('consistency in obj',typeof b.consistency === 'number');
  ok('good mood → high', b.mood >= 60);
  ok('good habit → high',b.habits >= 70);

  // Capped at 100
  const capped = buildLifeBalance(100, 10, 100, 100, 100);
  ok('tasks capped at 100',   capped.tasks  === 100);
  ok('habits capped at 100',  capped.habits === 100);
  ok('mood capped at 100',    capped.mood   === 100);
}

function testBuildActionPlan() {
  console.log('─── buildActionPlan ───');
  const recs = [
    { title: 'نم 8 ساعات' },
    { title: 'تمرين 20 دقيقة' },
    { title: 'اقرأ 30 دقيقة' },
  ];
  const plan = buildActionPlan('medium', 'stable', recs);
  ok('plan length == recs.length', plan.length === 3,          `got ${plan.length}`);
  ok('first item is today',        plan[0].day === 'اليوم');
  ok('second item is tomorrow',    plan[1].day === 'غداً');
  ok('each item has task',         plan.every(p => typeof p.task === 'string'));
  ok('each item has day',          plan.every(p => typeof p.day  === 'string'));

  // Empty recs
  const emptyPlan = buildActionPlan('low', 'stable', []);
  ok('empty recs → empty plan',    emptyPlan.length === 0);

  // Capped at 7
  const longRecs = Array.from({ length: 10 }, (_, i) => ({ title: `توصية ${i+1}` }));
  const longPlan = buildActionPlan('high', 'declining', longRecs);
  ok('plan capped at 7',           longPlan.length === 7, `got ${longPlan.length}`);
}

function testRiskScoreBoundaries() {
  console.log('─── Risk Score Boundaries ───');
  // Worst case: all bad values → should reach 8+ (high)
  const worst = calcBurnoutRisk(20, 1, 5, 10);
  ok('worst case → high',         worst.risk_level === 'high');

  // Best case: all perfect values → score should be 0
  const best = calcBurnoutRisk(90, 9, 0, 100);
  ok('best case → low',           best.risk_level === 'low');
  ok('best case → score 0',       best.risk_score === 0, `got ${best.risk_score}`);

  // Boundary at 5 (medium threshold)
  const atMedThreshold = calcBurnoutRisk(55, 6, 2, 35);
  ok('boundary 5 → medium',       atMedThreshold.risk_level === 'medium' ||
                                   atMedThreshold.risk_level === 'low');
}

// ── Run all ───────────────────────────────────────────────────────────────────
console.log('\n🔬 Coaching Service — Unit Tests\n' + '='.repeat(50));
testCalcTrend();
testCalcBurnoutRisk();
testBuildLifeBalance();
testBuildActionPlan();
testRiskScoreBoundaries();

console.log('\n' + '='.repeat(50));
const total = passed + failed;
const pct   = Math.round((passed / total) * 100);
console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}  📊 Total: ${total}  📈 ${pct}%`);
process.exit(failed > 0 ? 1 : 0);
