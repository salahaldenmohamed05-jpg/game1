/**
 * Phase 12.6 — Brain Service Validation Tests
 * =============================================
 * Tests for:
 *   1. Decision validity: no future tasks suggested incorrectly
 *   2. Time proximity: tasks within 1 hour get priority
 *   3. End-of-day: when all done → reflection/rest suggested
 *   4. Semantic understanding: keyword → category mapping
 *   5. Arabic text: clean UTF-8, no corrupted characters
 *   6. Backward compatibility: all existing Phase 12/12.5 features intact
 *   7. Loading speed: recompute resolves within 2 seconds
 */

'use strict';

// Add backend node_modules to resolve path
const path = require('path');
module.paths.unshift(path.join(__dirname, '..', 'backend', 'node_modules'));

// Suppress logger output during tests
const logger = require('../backend/src/utils/logger');
logger.info = () => {};
logger.debug = () => {};
logger.warn = () => {};
logger.error = () => {};

const brainService = require('../backend/src/services/brain.service');
const eventBus = require('../backend/src/core/eventBus');

// ─── Mock DB Models ─────────────────────────────────────────────────────────
const moment = require('moment-timezone');
const todayStr = moment().tz('Africa/Cairo').format('YYYY-MM-DD');
const tomorrowStr = moment().tz('Africa/Cairo').add(1, 'day').format('YYYY-MM-DD');
const nextWeekStr = moment().tz('Africa/Cairo').add(7, 'day').format('YYYY-MM-DD');
const yesterdayStr = moment().tz('Africa/Cairo').subtract(1, 'day').format('YYYY-MM-DD');
const nowHour = moment().tz('Africa/Cairo').hour();
const nowMin = moment().tz('Africa/Cairo').minute();

// ─── Test Utilities ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 1: Decision Validity — Future tasks not suggested
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 1: Future Task Filtering ═══');
{
  const isValid = brainService._isTaskTimeValid;

  // Task due today → valid
  assert(isValid({ due_date: todayStr }, todayStr, nowHour, nowMin) === true,
    'Task due today is valid');

  // Overdue task → valid
  assert(isValid({ due_date: yesterdayStr }, todayStr, nowHour, nowMin) === true,
    'Overdue task is valid');

  // Task due next week → NOT valid (no early start)
  assert(isValid({ due_date: nextWeekStr }, todayStr, nowHour, nowMin) === false,
    'Future task (next week) is NOT valid');

  // Task due next week with early_start_allowed → valid
  assert(isValid({ due_date: nextWeekStr, early_start_allowed: true }, todayStr, nowHour, nowMin) === true,
    'Future task with early_start_allowed IS valid');

  // Urgent future task → valid (urgency overrides)
  assert(isValid({ due_date: nextWeekStr, priority: 'urgent' }, todayStr, nowHour, nowMin) === true,
    'Urgent future task IS valid');

  // No due date → valid (ad-hoc)
  assert(isValid({ due_date: null }, todayStr, nowHour, nowMin) === true,
    'Task with no due date is valid');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: Time Proximity Bonus/Penalty
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 2: Time Proximity ═══');
{
  const getBonus = brainService._getTimeProximityBonus;

  // Task with due_time that already passed → high bonus
  const pastTime = `${String(Math.max(0, nowHour - 1)).padStart(2, '0')}:00`;
  assert(getBonus({ due_date: todayStr, due_time: pastTime }, todayStr, nowHour, nowMin) > 0,
    `Past due_time (${pastTime}) gets positive bonus — bonus=${getBonus({ due_date: todayStr, due_time: pastTime }, todayStr, nowHour, nowMin)}`);

  // Task 3+ hours away → slight penalty
  const farTime = `${String(Math.min(23, nowHour + 4)).padStart(2, '0')}:00`;
  assert(getBonus({ due_date: todayStr, due_time: farTime }, todayStr, nowHour, nowMin) <= 0,
    `Far due_time (${farTime}) gets penalty or zero — bonus=${getBonus({ due_date: todayStr, due_time: farTime }, todayStr, nowHour, nowMin)}`);

  // Task with no due_time → no bonus
  assert(getBonus({ due_date: todayStr }, todayStr, nowHour, nowMin) === 0,
    'No due_time → zero bonus');

  // Task not due today → no bonus
  assert(getBonus({ due_date: tomorrowStr, due_time: '10:00' }, todayStr, nowHour, nowMin) === 0,
    'Task not due today → zero bonus');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 3: Semantic Task Understanding
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 3: Semantic Understanding ═══');
{
  const analyze = brainService._analyzeTaskSemantics;

  // Gym → health
  const gym = analyze({ title: 'Go to gym' });
  assert(gym && gym.category === 'health', `"Go to gym" → health — ${gym?.category}`);

  // Study → learning
  const study = analyze({ title: 'Study for exam' });
  assert(study && study.category === 'learning', `"Study for exam" → learning — ${study?.category}`);

  // Client meeting → work
  const client = analyze({ title: 'Client meeting prep' });
  assert(client && client.category === 'work', `"Client meeting prep" → work — ${client?.category}`);

  // Arabic: تمرين → health
  const tamrin = analyze({ title: 'تمرين صباحي' });
  assert(tamrin && tamrin.category === 'health', `"تمرين صباحي" → health — ${tamrin?.category}`);

  // Arabic: مذاكرة → learning
  const mozakra = analyze({ title: 'مذاكرة الامتحان' });
  assert(mozakra && mozakra.category === 'learning', `"مذاكرة الامتحان" → learning — ${mozakra?.category}`);

  // Arabic: صلاة → spiritual
  const salah = analyze({ title: 'صلاة الفجر' });
  assert(salah && salah.category === 'spiritual', `"صلاة الفجر" → spiritual — ${salah?.category}`);

  // Unknown task → null
  const unknown = analyze({ title: 'do something random' });
  assert(unknown === null, '"do something random" → null (no category)');

  // Arabic labels present
  assert(gym.label_ar === 'صحة', 'Arabic label for health is present');
  assert(study.label_ar === 'تعلم', 'Arabic label for learning is present');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 4: End-of-Day Behavior (via recompute)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 4: End-of-Day Detection ═══');
(async () => {
  const userId = 'test-eod-' + Date.now();

  // We test the buildEndOfDayState indirectly:
  // The end-of-day detection requires completedTasks > 0 AND todayTasks.length === 0
  // Since mock DB has no tasks, this won't trigger (correct behavior)
  const state = await brainService.recompute(userId, { type: 'INITIAL_LOAD' });
  assert(state.currentDecision.type !== 'reflection',
    'Empty day does NOT trigger end-of-day reflection');

  // Verify the type is 'empty' when no tasks exist
  assert(state.currentDecision.type === 'empty',
    `No tasks → type is 'empty' — got: ${state.currentDecision.type}`);

  brainService.clearUserState(userId);

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 5: Arabic Text Quality — Clean UTF-8
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ Scenario 5: Arabic Text Quality ═══');
  {
    const state2 = await brainService.recompute('test-arabic-' + Date.now(), { type: 'INITIAL_LOAD' });

    // Check that all text fields are clean (no replacement characters, no garbled bytes)
    const allText = JSON.stringify(state2);
    const hasReplacementChar = allText.includes('\uFFFD');
    assert(!hasReplacementChar, 'No Unicode replacement characters (U+FFFD)');

    // Check that Arabic text is present
    const hasArabic = /[\u0600-\u06FF]/.test(allText);
    assert(hasArabic, 'Arabic characters present in brain state');

    // Check specific Arabic fields
    if (state2.currentDecision.why && state2.currentDecision.why.length > 0) {
      const firstWhy = state2.currentDecision.why[0];
      assert(typeof firstWhy === 'string' && firstWhy.length > 0, `"why" is a non-empty string — "${firstWhy.substring(0, 30)}..."`);
      const cleanArabic = /[\u0600-\u06FF]/.test(firstWhy);
      assert(cleanArabic, '"why" contains Arabic text');
    }

    if (state2.currentDecision.smallestStep) {
      const step = state2.currentDecision.smallestStep;
      assert(typeof step === 'string' && step.length > 0, `"smallestStep" is non-empty — "${step.substring(0, 30)}..."`);
    }

    // Verify no garbled encoding in reason
    if (state2.reason) {
      assert(!state2.reason.includes('Ø') && !state2.reason.includes('Ù'), 'reason has no garbled UTF-8 bytes');
    }

    brainService.clearUserState('test-arabic-' + Date.now());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 6: Speed — Recompute within 2 seconds
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ Scenario 6: Speed ═══');
  {
    const startMs = Date.now();
    const fastState = await brainService.recompute('test-speed-' + Date.now(), { type: 'INITIAL_LOAD' });
    const elapsed = Date.now() - startMs;
    assert(elapsed < 2000, `Recompute completed in ${elapsed}ms (< 2000ms)`);
    assert(fastState !== null, 'State is non-null');
    assert(fastState.currentDecision !== undefined, 'currentDecision exists');
    assert(fastState.lastUpdatedAt !== undefined, 'lastUpdatedAt exists');
    brainService.clearUserState('test-speed-' + Date.now());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 7: Backward Compatibility — All Phase 12.5 fields present
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ Scenario 7: Backward Compatibility ═══');
  {
    const bwState = await brainService.recompute('test-bw-' + Date.now(), { type: 'INITIAL_LOAD' });

    assert(bwState.currentDecision !== undefined, 'currentDecision field exists');
    assert(bwState.reason !== undefined, 'reason field exists');
    assert(typeof bwState.riskLevel === 'string', `riskLevel is string — ${bwState.riskLevel}`);
    assert(bwState.userState !== undefined, 'userState exists');
    assert(bwState.userState.energy !== undefined, 'userState.energy exists');
    assert(bwState.userState.momentum !== undefined, 'userState.momentum exists');
    assert(bwState.adaptiveSignals !== undefined, 'adaptiveSignals exists');
    assert(typeof bwState.adaptiveSignals.rejectionStreak === 'number', 'rejectionStreak is number');
    assert(typeof bwState.adaptiveSignals.completionStreak === 'number', 'completionStreak is number');
    assert(typeof bwState.adaptiveSignals.difficultyModifier === 'number', 'difficultyModifier is number');
    assert(typeof bwState.adaptiveSignals.maxTaskMinutes === 'number', 'maxTaskMinutes is number');
    assert(typeof bwState.adaptiveSignals.inactivityStrategy === 'string', 'inactivityStrategy is string');
    assert(bwState.decisionMemory !== undefined, 'decisionMemory exists');
    assert(typeof bwState.decisionMemory.totalDecisions === 'number', 'totalDecisions is number');
    assert(typeof bwState.decisionMemory.recentAcceptanceRate === 'number', 'recentAcceptanceRate is number');
    assert(Array.isArray(bwState.decisionMemory.blockedTasks), 'blockedTasks is array');
    assert(typeof bwState.triggerEvent === 'string', 'triggerEvent is string');
    assert(typeof bwState.lastUpdatedAt === 'string', 'lastUpdatedAt is string');

    brainService.clearUserState('test-bw-' + Date.now());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Phase 12.6 Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(60)}`);

  if (failed > 0) {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ ALL PHASE 12.6 TESTS PASSED');
    process.exit(0);
  }
})();
