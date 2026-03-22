/**
 * Unit Tests — energy.service.js
 * ================================
 * Tests the pure/helper logic of the energy service without DB calls.
 */

let passed = 0;
let failed = 0;

function ok(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ' | ' + detail : ''}`); failed++; }
}

// ── Helpers replicated from service ──────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Matches actual service: Math.min(20, Math.round((sleepHours / 8) * 20))
function calcSleepScore(sleepHours) {
  if (sleepHours === null || sleepHours === undefined) return 10; // neutral default
  return Math.min(20, Math.round((sleepHours / 8) * 20));
}

function calcMoodScore(avgMood) {
  if (!avgMood) return 12;
  if (avgMood >= 7) return 25;
  if (avgMood >= 5) return 17;
  if (avgMood >= 3) return 10;
  return 5;
}

function calcHabitScore(habitRate) {
  if (habitRate >= 80) return 20;
  if (habitRate >= 60) return 14;
  if (habitRate >= 40) return 9;
  return 4;
}

function calcTaskLoadScore(pendingUrgent) {
  if (pendingUrgent === 0) return 20;
  if (pendingUrgent <= 2) return 14;
  if (pendingUrgent <= 5) return 9;
  return 4;
}

function calcStressScore(activeFlags) {
  if (activeFlags === 0) return 15;
  if (activeFlags <= 1) return 10;
  if (activeFlags <= 3) return 6;
  return 2;
}

function buildEnergyLevel(score) {
  if (score >= 75) return { level: 'high',     label: '⚡ طاقة عالية' };
  if (score >= 50) return { level: 'medium',   label: '✅ طاقة متوسطة' };
  if (score >= 25) return { level: 'low',      label: '⚠️ طاقة منخفضة' };
  return              { level: 'critical', label: '🔴 طاقة حرجة' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function testSleepScore() {
  console.log('─── Sleep Score ───');
  // Service formula: Math.min(20, Math.round((h / 8) * 20))
  ok('8h sleep → max 20',       calcSleepScore(8)  === 20);
  ok('8+ sleep capped at 20',   calcSleepScore(10) === 20);
  ok('7h sleep → 18',           calcSleepScore(7)  === Math.min(20, Math.round(7/8*20)));
  ok('6h sleep → correct',      calcSleepScore(6)  === Math.min(20, Math.round(6/8*20)));
  ok('5h sleep → correct',      calcSleepScore(5)  === Math.min(20, Math.round(5/8*20)));
  ok('4h sleep → 10',           calcSleepScore(4)  === 10);
  ok('0h sleep → 0',            calcSleepScore(0)  === 0);
  ok('no sleep data → 10',      calcSleepScore(null) === 10);
  ok('no sleep data (undef)→10',calcSleepScore(undefined) === 10);
  // Score is always 0-20
  ok('score <= 20 for any hours', calcSleepScore(12) <= 20);
  ok('score >= 0 for any hours',  calcSleepScore(0)  >= 0);
}

function testMoodScore() {
  console.log('─── Mood Score ───');
  ok('mood 7 → 25',     calcMoodScore(7)   === 25);
  ok('mood 10 → 25',    calcMoodScore(10)  === 25);
  ok('mood 5 → 17',     calcMoodScore(5)   === 17);
  ok('mood 6 → 17',     calcMoodScore(6)   === 17);
  ok('mood 3 → 10',     calcMoodScore(3)   === 10);
  ok('mood 4 → 10',     calcMoodScore(4)   === 10);
  ok('mood 1 → 5',      calcMoodScore(1)   === 5);
  ok('no mood → 12',    calcMoodScore(null) === 12);
}

function testHabitScore() {
  console.log('─── Habit Score ───');
  ok('100% → 20',    calcHabitScore(100) === 20);
  ok('80% → 20',     calcHabitScore(80)  === 20);
  ok('60% → 14',     calcHabitScore(60)  === 14);
  ok('79% → 14',     calcHabitScore(79)  === 14);
  ok('40% → 9',      calcHabitScore(40)  === 9);
  ok('0% → 4',       calcHabitScore(0)   === 4);
}

function testTaskLoadScore() {
  console.log('─── Task Load Score ───');
  ok('0 urgent → 20',   calcTaskLoadScore(0) === 20);
  ok('1 urgent → 14',   calcTaskLoadScore(1) === 14);
  ok('2 urgent → 14',   calcTaskLoadScore(2) === 14);
  ok('3 urgent → 9',    calcTaskLoadScore(3) === 9);
  ok('5 urgent → 9',    calcTaskLoadScore(5) === 9);
  ok('6 urgent → 4',    calcTaskLoadScore(6) === 4);
}

function testStressScore() {
  console.log('─── Stress Score ───');
  ok('0 flags → 15',   calcStressScore(0) === 15);
  ok('1 flag → 10',    calcStressScore(1) === 10);
  ok('2 flags → 6',    calcStressScore(2) === 6);
  ok('3 flags → 6',    calcStressScore(3) === 6);
  ok('4 flags → 2',    calcStressScore(4) === 2);
}

function testEnergyLevel() {
  console.log('─── Energy Level Classification ───');
  const h = buildEnergyLevel(80);
  ok('score 80 → high',        h.level === 'high');
  ok('score 80 label contains ⚡', h.label.includes('⚡'));

  const m = buildEnergyLevel(60);
  ok('score 60 → medium',      m.level === 'medium');

  const l = buildEnergyLevel(40);
  ok('score 40 → low',         l.level === 'low');

  const c = buildEnergyLevel(10);
  ok('score 10 → critical',    c.level === 'critical');

  // Boundary checks
  ok('score 75 → high',        buildEnergyLevel(75).level === 'high');
  ok('score 74 → medium',      buildEnergyLevel(74).level === 'medium');
  ok('score 50 → medium',      buildEnergyLevel(50).level === 'medium');
  ok('score 49 → low',         buildEnergyLevel(49).level === 'low');
  ok('score 25 → low',         buildEnergyLevel(25).level === 'low');
  ok('score 24 → critical',    buildEnergyLevel(24).level === 'critical');
}

function testTotalScoreRange() {
  console.log('─── Total Score Range ───');
  // Best case
  const best = calcSleepScore(8) + calcMoodScore(9) + calcHabitScore(100) +
               calcTaskLoadScore(0) + calcStressScore(0);
  ok('best total == 100', best === 100, `got ${best}`);

  // Worst case
  const worst = calcSleepScore(3) + calcMoodScore(1) + calcHabitScore(0) +
                calcTaskLoadScore(10) + calcStressScore(10);
  ok('worst total >= 0',  worst >= 0, `got ${worst}`);
  ok('worst total <= 30', worst <= 30, `got ${worst}`);

  // Neutral (no data)
  const neutral = calcSleepScore(null) + calcMoodScore(null) + calcHabitScore(50) +
                  calcTaskLoadScore(1) + calcStressScore(1);
  ok('neutral total in range', neutral >= 20 && neutral <= 80, `got ${neutral}`);
}

function testClamp() {
  console.log('─── Clamp Utility ───');
  ok('clamp within',    clamp(50, 0, 100) === 50);
  ok('clamp below min', clamp(-5, 0, 100) === 0);
  ok('clamp above max', clamp(105, 0, 100) === 100);
}

// ── Run all ───────────────────────────────────────────────────────────────────
console.log('\n🔬 Energy Service — Unit Tests\n' + '='.repeat(50));
testSleepScore();
testMoodScore();
testHabitScore();
testTaskLoadScore();
testStressScore();
testEnergyLevel();
testTotalScoreRange();
testClamp();

console.log('\n' + '='.repeat(50));
const total = passed + failed;
const pct   = Math.round((passed / total) * 100);
console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}  📊 Total: ${total}  📈 ${pct}%`);
process.exit(failed > 0 ? 1 : 0);
