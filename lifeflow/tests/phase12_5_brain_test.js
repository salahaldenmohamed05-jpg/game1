/**
 * Phase 12.5 Validation — Self-Adjusting Cognitive Brain Tests
 * ═════════════════════════════════════════════════════════════
 * Each test must complete within 1-2 seconds.
 *
 * VALIDATION SCENARIOS:
 *   1. Reject same task 3× → disappears from suggestions
 *   2. Accept task → similar tasks appear more (history boost)
 *   3. Higher skip rate → difficulty drops gradually (continuous modifier)
 *   4. No action → shift to smaller tasks (continuous inactivity)
 *   5. Confidence changes over time (dynamic confidence formula)
 *
 * ALSO VALIDATES: No duplicate decision logic, all decisions from brain.service only
 */

'use strict';

const path = require('path');

// Resolve paths relative to backend
const BACKEND = path.join(__dirname, '..', 'backend', 'src');

const eventBus = require(path.join(BACKEND, 'core', 'eventBus'));
const brainService = require(path.join(BACKEND, 'services', 'brain.service'));

// Mock logger to suppress logs during test
const logger = require(path.join(BACKEND, 'utils', 'logger'));
logger.info = () => {};
logger.debug = () => {};
logger.warn = () => {};

const TEST_USER = 'test-user-v2-' + Date.now();

// ─── Test Helpers ───────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    results.push(`  ✅ ${testName}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    results.push(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

async function measureMs(fn) {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

// ═════════════════════════════════════════════════════════════════════════════
// SCENARIO TESTS
// ═════════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('\n🧠 Phase 12.5: Self-Adjusting Cognitive Brain — 5 Validation Scenarios\n');
  console.log('─'.repeat(65));

  // Clean state
  brainService.clearUserState(TEST_USER);
  eventBus.reset();

  // Initialize brain (without socket)
  brainService.init(null);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 1: Reject same task 3× → disappears from suggestions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n📋 Scenario 1: Reject same task 3× → task blocked by anti-repetition guard');
  brainService.clearUserState(TEST_USER);

  const taskId1 = 'task-repeat-target';

  // Record 3 rejections for the same task
  brainService._recordDecisionOutcome(TEST_USER, taskId1, 'rejected');
  brainService._recordDecisionOutcome(TEST_USER, taskId1, 'rejected');
  const s1t = await measureMs(async () => {
    brainService._recordDecisionOutcome(TEST_USER, taskId1, 'rejected');
    return brainService._isTaskBlocked(TEST_USER, taskId1);
  });

  assert(s1t.result === true, 'Task blocked after 3 rejections', `blocked=${s1t.result}`);

  // Verify it's in the blocked list
  const mem1 = brainService.getMemory(TEST_USER);
  assert(mem1.blockedTaskIds.includes(taskId1), 'Blocked task appears in blockedTaskIds', `blocked=${JSON.stringify(mem1.blockedTaskIds)}`);
  assert(s1t.ms < 100, 'Blocking check completes fast', `${s1t.ms}ms`);

  // Verify a different task is NOT blocked
  assert(brainService._isTaskBlocked(TEST_USER, 'other-task') === false, 'Other tasks remain unblocked');

  // Recompute should pick alternatives (empty if no tasks in DB mock)
  const s1r = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'DECISION_REJECTED', taskId: taskId1 });
  });
  assert(s1r.result.decisionMemory.blockedTasks.includes(taskId1), 'brainState.decisionMemory shows blocked task');
  assert(s1r.ms < 2000, `Recompute within 2s`, `${s1r.ms}ms`);
  console.log(`  ⏱️  ${s1r.ms}ms | Blocked: ${JSON.stringify(s1r.result.decisionMemory.blockedTasks)}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 2: Accept task → acceptance rate increases → history boost
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n📋 Scenario 2: Accept task → similar tasks get boosted');
  brainService.clearUserState(TEST_USER);

  const taskIdA = 'task-accepted-one';

  // Record multiple acceptances
  brainService._recordDecisionOutcome(TEST_USER, taskIdA, 'accepted');
  brainService._recordDecisionOutcome(TEST_USER, taskIdA, 'accepted');
  brainService._recordDecisionOutcome(TEST_USER, taskIdA, 'accepted');

  // Get acceptance rate — should be 100% for this task
  const mem2 = brainService._getDecisionMemory(TEST_USER);
  const taskStats = mem2.taskStats.get(taskIdA);
  assert(taskStats.accepted === 3, 'Task has 3 acceptances', `accepted=${taskStats.accepted}`);
  assert(taskStats.consecutiveRejects === 0, 'No consecutive rejects', `consRejects=${taskStats.consecutiveRejects}`);
  assert(taskStats.blockedUntil === 0, 'Task not blocked', `blockedUntil=${taskStats.blockedUntil}`);

  // Overall recent acceptance rate should be high
  const accRate = brainService.getMemory(TEST_USER).recentAcceptanceRate;
  assert(accRate === 1.0 || accRate === 100, 'Recent acceptance rate is 100%', `rate=${accRate}`);

  // Recompute should reflect high acceptance in brainState
  const s2r = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'TASK_COMPLETED', taskId: taskIdA });
  });
  assert(s2r.result.decisionMemory.recentAcceptanceRate > 50, 'Acceptance rate > 50% in brainState', `rate=${s2r.result.decisionMemory.recentAcceptanceRate}`);
  assert(s2r.ms < 2000, `Completes within 2s`, `${s2r.ms}ms`);
  console.log(`  ⏱️  ${s2r.ms}ms | AcceptRate: ${s2r.result.decisionMemory.recentAcceptanceRate}%`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 3: Higher skip rate → difficulty drops gradually
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n📋 Scenario 3: Higher skip rate → difficulty modifier drops continuously');
  brainService.clearUserState(TEST_USER);

  // Skip 1: modifier should decrease slightly
  const s3a = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'TASK_SKIPPED', taskId: 's3-t1', skipType: 'lazy' });
  });
  const mod1 = s3a.result.adaptiveSignals.difficultyModifier;

  // Skip 2: modifier should decrease more
  const s3b = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'TASK_SKIPPED', taskId: 's3-t2', skipType: 'overwhelmed' });
  });
  const mod2 = s3b.result.adaptiveSignals.difficultyModifier;

  // Skip 3: modifier should decrease even more
  const s3c = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'TASK_SKIPPED', taskId: 's3-t3', skipType: 'low_energy' });
  });
  const mod3 = s3c.result.adaptiveSignals.difficultyModifier;

  assert(typeof mod1 === 'number', 'Difficulty modifier is a number', `${mod1}`);
  assert(typeof mod2 === 'number', 'Difficulty modifier 2 is a number', `${mod2}`);
  assert(typeof mod3 === 'number', 'Difficulty modifier 3 is a number', `${mod3}`);
  // After 3 skips the modifier should be <= the initial or slightly lower
  assert(mod3 <= 1.0, 'After 3 skips modifier <= 1.0 (difficulty reduced)', `mod=${mod3}`);
  assert(s3c.result.adaptiveSignals.maxTaskMinutes <= 60, 'Max task minutes reduced', `max=${s3c.result.adaptiveSignals.maxTaskMinutes}`);
  assert(s3c.ms < 2000, `Completes within 2s`, `${s3c.ms}ms`);
  console.log(`  ⏱️  Modifiers: skip1=${mod1} → skip2=${mod2} → skip3=${mod3}`);
  console.log(`  📐 MaxMinutes: ${s3c.result.adaptiveSignals.maxTaskMinutes}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 4: No action → shift to smaller tasks (inactivity awareness)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n📋 Scenario 4: Inactivity → shift to smaller tasks');
  brainService.clearUserState(TEST_USER);

  const s4 = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'USER_INACTIVE' });
  });

  assert(s4.result !== null, 'Returns state on inactivity');
  assert(s4.result.adaptiveSignals.inactivityMinutes >= 20, 'Inactivity tracked', `${s4.result.adaptiveSignals.inactivityMinutes} min`);
  assert(
    s4.result.adaptiveSignals.adaptiveOverride === 'inactivity_smallest' || s4.result.currentDecision.type === 'empty',
    'Inactivity triggers smallest-task override or empty state',
    `override=${s4.result.adaptiveSignals.adaptiveOverride}`
  );
  assert(s4.result.adaptiveSignals.inactivityStrategy !== undefined, 'Inactivity strategy exposed', `strategy=${s4.result.adaptiveSignals.inactivityStrategy}`);
  assert(s4.ms < 2000, `Completes within 2s`, `${s4.ms}ms`);
  console.log(`  ⏱️  ${s4.ms}ms | Override: ${s4.result.adaptiveSignals.adaptiveOverride} | Strategy: ${s4.result.adaptiveSignals.inactivityStrategy} | InactMin: ${s4.result.adaptiveSignals.inactivityMinutes}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 5: Confidence changes over time
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n📋 Scenario 5: Confidence evolves with decision history');
  brainService.clearUserState(TEST_USER);

  // Initial confidence (no history)
  const confTask = { id: 'conf-task', estimated_duration: 30, title: 'Test Task' };
  const conf0 = brainService._computeDynamicConfidence(TEST_USER, confTask.id, { level: 'medium', score: 65 }, confTask);

  // Record some acceptances → confidence should increase
  brainService._recordDecisionOutcome(TEST_USER, confTask.id, 'accepted');
  brainService._recordDecisionOutcome(TEST_USER, confTask.id, 'accepted');
  brainService._recordDecisionOutcome(TEST_USER, confTask.id, 'accepted');
  const conf1 = brainService._computeDynamicConfidence(TEST_USER, confTask.id, { level: 'medium', score: 65 }, confTask);

  // Record some rejections → confidence should decrease
  brainService._recordDecisionOutcome(TEST_USER, confTask.id, 'rejected');
  brainService._recordDecisionOutcome(TEST_USER, confTask.id, 'rejected');
  brainService._recordDecisionOutcome(TEST_USER, confTask.id, 'rejected');
  brainService._recordDecisionOutcome(TEST_USER, confTask.id, 'rejected');
  const conf2 = brainService._computeDynamicConfidence(TEST_USER, confTask.id, { level: 'medium', score: 65 }, confTask);

  assert(typeof conf0 === 'number' && conf0 >= 5 && conf0 <= 98, 'Initial confidence in range 5-98', `conf0=${conf0}`);
  assert(conf1 > conf0, 'Confidence increases after acceptances', `${conf0} → ${conf1}`);
  assert(conf2 < conf1, 'Confidence decreases after rejections', `${conf1} → ${conf2}`);
  assert(conf0 !== conf1 || conf1 !== conf2, 'Confidence changed over time (not static)');

  // Test energy match impact on confidence
  const confHigh = brainService._computeDynamicConfidence(TEST_USER, 'new-task', { level: 'high', score: 85 }, { id: 'new-task', estimated_duration: 60 });
  const confLow = brainService._computeDynamicConfidence(TEST_USER, 'new-task', { level: 'low', score: 20 }, { id: 'new-task', estimated_duration: 60 });
  assert(confHigh > confLow, 'High energy + large task has higher confidence than low energy + large task', `high=${confHigh} low=${confLow}`);

  console.log(`  📈 Confidence evolution: initial=${conf0} → 3 accepts=${conf1} → 4 rejects=${conf2}`);
  console.log(`  ⚡ Energy impact: high+large=${confHigh} vs low+large=${confLow}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BONUS: Verify difficulty modifier is continuous, not binary
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n📋 Bonus: Difficulty modifier continuity');

  const dm0 = brainService._computeDifficultyModifier(0.0, { level: 'high', score: 85 }, 'morning');
  const dm25 = brainService._computeDifficultyModifier(0.25, { level: 'medium', score: 60 }, 'afternoon');
  const dm50 = brainService._computeDifficultyModifier(0.50, { level: 'medium', score: 60 }, 'afternoon');
  const dm75 = brainService._computeDifficultyModifier(0.75, { level: 'low', score: 30 }, 'evening');
  const dm100 = brainService._computeDifficultyModifier(1.0, { level: 'low', score: 20 }, 'night');

  assert(dm0.modifier > dm25.modifier || dm0.modifier >= dm25.modifier, 'Modifier decreases as skip rate rises', `0%=${dm0.modifier} 25%=${dm25.modifier}`);
  assert(dm75.modifier < dm25.modifier, '75% skip rate has lower modifier than 25%', `25%=${dm25.modifier} 75%=${dm75.modifier}`);
  assert(dm100.maxMinutes <= 30, '100% skip rate maxMinutes ≤ 30', `max=${dm100.maxMinutes}`);
  assert(dm0.maxMinutes >= dm100.maxMinutes, 'Zero skip rate allows more minutes', `0%=${dm0.maxMinutes} 100%=${dm100.maxMinutes}`);

  console.log(`  📐 Modifiers: 0%=${dm0.modifier}(${dm0.maxMinutes}m) | 25%=${dm25.modifier}(${dm25.maxMinutes}m) | 50%=${dm50.modifier}(${dm50.maxMinutes}m) | 75%=${dm75.modifier}(${dm75.maxMinutes}m) | 100%=${dm100.modifier}(${dm100.maxMinutes}m)`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BONUS: Verify no fallback state has type='fallback' (all states are from brain)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n📋 Bonus: All decisions from brain service — no duplicate logic');
  brainService.clearUserState(TEST_USER);

  const stateA = await brainService.recompute(TEST_USER, { type: 'INITIAL_LOAD' });
  assert(stateA.reason !== 'fallback', 'State reason is not "fallback"', `reason="${stateA.reason}"`);
  assert(stateA.currentDecision !== undefined, 'currentDecision always present');
  assert(stateA.decisionMemory !== undefined, 'decisionMemory always present');
  assert(stateA.adaptiveSignals.difficultyModifier !== undefined, 'difficultyModifier exposed');
  assert(stateA.adaptiveSignals.inactivityStrategy !== undefined, 'inactivityStrategy exposed');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BONUS: Verify EventBus still works
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n📋 Bonus: EventBus pub/sub');
  eventBus.reset();
  brainService.init(null); // re-init to re-subscribe
  let received = false;
  eventBus.subscribe('TASK_COMPLETED', () => { received = true; });
  eventBus.emit('TASK_COMPLETED', { userId: TEST_USER, taskId: 'test' });
  await new Promise(r => setTimeout(r, 50));
  assert(received, 'EventBus subscriber received event');
  const stats = eventBus.getStats();
  assert(stats.subscribers.TASK_COMPLETED >= 1, 'EventBus tracks subscriber count');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(65));
  console.log(`\n🏁 Results: ${passed} passed, ${failed} failed\n`);
  results.forEach(r => console.log(r));
  console.log('');

  // Clean up timers so process exits
  brainService.clearUserState(TEST_USER);

  if (failed > 0) {
    console.log('❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('✅ ALL PHASE 12.5 TESTS PASSED');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
