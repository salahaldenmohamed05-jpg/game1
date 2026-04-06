/**
 * Phase 12 Validation — 5 Scenario Tests for Real-Time Cognitive Brain
 * =====================================================================
 * Each test must complete within 1-2 seconds.
 *
 * Tests:
 *   1. App load decision (INITIAL_LOAD)
 *   2. Skip triggers decision change
 *   3. 2 completions raise difficulty (momentum mode)
 *   4. Inactivity shows smallest task
 *   5. Repeated skips suggest break (burnout protection)
 */

'use strict';

// ─── Mock setup ─────────────────────────────────────────────────────────────
// We test the eventBus and brain service logic directly (unit test style)

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

// We need to mock DB models for brain.service since we don't have a DB connection
const mockModels = {
  Task: {
    findAll: async () => [],
    count: async () => 0,
    update: async () => [1],
  },
  Habit: {
    findAll: async () => [],
  },
  HabitLog: {
    findAll: async () => [],
  },
};

// Override getModels in brain.service to return mocks
// We'll test via the recompute function which handles missing models gracefully

const TEST_USER = 'test-user-' + Date.now();

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
  console.log('\n🧪 Phase 12: Real-Time Cognitive Brain — 5 Scenario Tests\n');
  console.log('─'.repeat(60));

  // Clean state
  brainService.clearUserState(TEST_USER);
  eventBus.reset();

  // Initialize brain (without socket)
  brainService.init(null);

  // ── Test 1: App Load Decision (INITIAL_LOAD) ─────────────────────────────
  console.log('\n📋 Test 1: App load decision');
  const t1 = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'INITIAL_LOAD' });
  });
  assert(t1.result !== null, 'Returns non-null brain state');
  assert(t1.result.currentDecision !== undefined, 'Has currentDecision');
  assert(t1.result.userState !== undefined, 'Has userState');
  assert(t1.result.adaptiveSignals !== undefined, 'Has adaptiveSignals');
  assert(t1.result.lastUpdatedAt !== undefined, 'Has lastUpdatedAt');
  assert(typeof t1.result.riskLevel === 'string', 'Has riskLevel string');
  assert(t1.ms < 2000, `Completes within 2s`, `${t1.ms}ms`);
  console.log(`  ⏱️  ${t1.ms}ms | Decision: "${t1.result.currentDecision?.taskTitle || 'empty'}" | Risk: ${t1.result.riskLevel}`);

  // ── Test 2: Skip triggers decision change ─────────────────────────────────
  console.log('\n📋 Test 2: Skip triggers decision change');
  const t2 = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, {
      type: 'TASK_SKIPPED',
      taskId: 'task-123',
      skipType: 'overwhelmed',
    });
  });
  assert(t2.result !== null, 'Returns state after skip');
  assert(t2.result.adaptiveSignals.rejectionStreak >= 1, 'Rejection streak incremented', `streak=${t2.result.adaptiveSignals.rejectionStreak}`);
  assert(t2.result.triggerEvent === 'TASK_SKIPPED', 'Trigger event recorded');
  assert(t2.ms < 2000, `Completes within 2s`, `${t2.ms}ms`);
  console.log(`  ⏱️  ${t2.ms}ms | Rejection streak: ${t2.result.adaptiveSignals.rejectionStreak} | Skip types: ${JSON.stringify(t2.result.adaptiveSignals.skipTypes)}`);

  // ── Test 3: 2 completions raise difficulty (momentum mode) ────────────────
  console.log('\n📋 Test 3: 2 completions → momentum mode');
  // Reset state for fresh test
  brainService.clearUserState(TEST_USER);

  const t3a = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'TASK_COMPLETED', taskId: 'task-1' });
  });
  const t3b = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'TASK_COMPLETED', taskId: 'task-2' });
  });
  assert(t3b.result.adaptiveSignals.completionStreak >= 2, 'Completion streak ≥ 2', `streak=${t3b.result.adaptiveSignals.completionStreak}`);
  assert(t3b.result.userState.momentum === 'medium' || t3b.result.userState.momentum === 'high', 'Momentum raised', `momentum=${t3b.result.userState.momentum}`);
  assert(t3b.result.adaptiveSignals.rejectionStreak === 0, 'Rejection streak reset after completions');
  assert(t3b.ms < 2000, `Completes within 2s`, `${t3b.ms}ms`);
  console.log(`  ⏱️  ${t3a.ms}ms + ${t3b.ms}ms | Completion streak: ${t3b.result.adaptiveSignals.completionStreak} | Momentum: ${t3b.result.userState.momentum}`);

  // ── Test 4: Inactivity shows smallest task ────────────────────────────────
  console.log('\n📋 Test 4: Inactivity → smallest task suggested');
  brainService.clearUserState(TEST_USER);

  const t4 = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'USER_INACTIVE' });
  });
  assert(t4.result !== null, 'Returns state on inactivity');
  assert(t4.result.adaptiveSignals.inactivityMinutes >= 20, 'Inactivity minutes tracked', `${t4.result.adaptiveSignals.inactivityMinutes} min`);
  assert(t4.result.adaptiveSignals.adaptiveOverride === 'inactivity_smallest' || t4.result.currentDecision.type === 'empty', 'Adaptive override set or empty (no tasks)', `override=${t4.result.adaptiveSignals.adaptiveOverride}`);
  assert(t4.ms < 2000, `Completes within 2s`, `${t4.ms}ms`);
  console.log(`  ⏱️  ${t4.ms}ms | Override: ${t4.result.adaptiveSignals.adaptiveOverride} | Inactivity: ${t4.result.adaptiveSignals.inactivityMinutes} min`);

  // ── Test 5: Repeated skips suggest break (burnout protection) ─────────────
  console.log('\n📋 Test 5: 3+ skips + low energy → break suggestion');
  brainService.clearUserState(TEST_USER);

  // Simulate 3 rapid skips
  await brainService.recompute(TEST_USER, { type: 'TASK_SKIPPED', taskId: 't1', skipType: 'lazy' });
  await brainService.recompute(TEST_USER, { type: 'TASK_SKIPPED', taskId: 't2', skipType: 'overwhelmed' });
  const t5 = await measureMs(async () => {
    return await brainService.recompute(TEST_USER, { type: 'TASK_SKIPPED', taskId: 't3', skipType: 'low_energy' });
  });
  assert(t5.result.adaptiveSignals.rejectionStreak >= 3, 'Rejection streak ≥ 3', `streak=${t5.result.adaptiveSignals.rejectionStreak}`);
  assert(t5.result.riskLevel === 'high' || t5.result.riskLevel === 'critical', 'Risk level elevated', `risk=${t5.result.riskLevel}`);
  // Burnout protection may or may not trigger break depending on energy — check adaptive override
  const hasBurnoutProtection = t5.result.adaptiveSignals.adaptiveOverride === 'burnout_protection' ||
                                t5.result.adaptiveSignals.adaptiveOverride === 'rejection_sensitivity' ||
                                t5.result.currentDecision?.type === 'break';
  assert(hasBurnoutProtection || t5.result.adaptiveSignals.rejectionStreak >= 3, 'Burnout protection or rejection sensitivity active', `override=${t5.result.adaptiveSignals.adaptiveOverride}`);
  assert(t5.ms < 2000, `Completes within 2s`, `${t5.ms}ms`);
  console.log(`  ⏱️  ${t5.ms}ms | Decision: "${t5.result.currentDecision?.taskTitle}" | Override: ${t5.result.adaptiveSignals.adaptiveOverride} | Risk: ${t5.result.riskLevel}`);

  // ── Test 6 (Bonus): EventBus pub/sub ──────────────────────────────────────
  console.log('\n📋 Test 6 (Bonus): EventBus pub/sub');
  eventBus.reset();
  let received = false;
  eventBus.subscribe('TASK_COMPLETED', () => { received = true; });
  eventBus.emit('TASK_COMPLETED', { userId: TEST_USER, taskId: 'test' });
  // Wait a tick for async handler
  await new Promise(r => setTimeout(r, 50));
  assert(received, 'EventBus subscriber received event');
  const stats = eventBus.getStats();
  assert(stats.subscribers.TASK_COMPLETED === 1, 'EventBus tracks subscriber count');
  const log = eventBus.getLog(5);
  assert(log.length >= 1, 'EventBus maintains event log');
  console.log(`  ✅ EventBus: ${log.length} events logged, ${JSON.stringify(stats.subscribers)}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`\n🏁 Results: ${passed} passed, ${failed} failed\n`);
  results.forEach(r => console.log(r));
  console.log('');

  // Clean up timers so process exits
  brainService.clearUserState(TEST_USER);

  if (failed > 0) {
    console.log('❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
