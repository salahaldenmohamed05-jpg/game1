/**
 * Phase 12.7 — Intent + Context Awareness Validation Tests
 * =========================================================
 * Tests for:
 *   1. Intent inference: deadline / urgent / growth / maintenance
 *   2. Intent scoring: deadline > urgent > growth > maintenance
 *   3. Day context classification: productive / partial / empty
 *   4. End-of-day responses: tone matches context
 *   5. HARD RULES: empty days NOT productive, no fake positives
 *   6. Growth tasks not forced during low energy
 *   7. Maintenance tasks favored during low energy
 *   8. Intent labels in Arabic
 *   9. Backward compatibility: all Phase 12.6 fields still present
 *   10. dayContext present in recompute output
 */

'use strict';

const path = require('path');
module.paths.unshift(path.join(__dirname, '..', 'backend', 'node_modules'));

// Suppress logger output during tests
const logger = require('../backend/src/utils/logger');
logger.info = () => {};
logger.debug = () => {};
logger.warn = () => {};
logger.error = () => {};

const brainService = require('../backend/src/services/brain.service');
const moment = require('moment-timezone');

const todayStr = moment().tz('Africa/Cairo').format('YYYY-MM-DD');
const tomorrowStr = moment().tz('Africa/Cairo').add(1, 'day').format('YYYY-MM-DD');
const yesterdayStr = moment().tz('Africa/Cairo').subtract(1, 'day').format('YYYY-MM-DD');
const nextWeekStr = moment().tz('Africa/Cairo').add(7, 'day').format('YYYY-MM-DD');

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
// SCENARIO 1: INTENT INFERENCE
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 1: Intent Inference ═══');
{
  const inferIntent = brainService._inferIntent;

  // 1a. Overdue task → deadline
  assert(inferIntent({ due_date: yesterdayStr, title: 'Buy groceries' }, todayStr) === 'deadline',
    'Overdue task → deadline intent');

  // 1b. Due today → deadline
  assert(inferIntent({ due_date: todayStr, title: 'Submit report' }, todayStr) === 'deadline',
    'Due today → deadline intent');

  // 1c. Due tomorrow + high priority → deadline
  assert(inferIntent({ due_date: tomorrowStr, priority: 'high', title: 'Prepare presentation' }, todayStr) === 'deadline',
    'Due tomorrow + high priority → deadline intent');

  // 1d. Due tomorrow + low priority → NOT deadline (future, no urgency)
  const futureLow = inferIntent({ due_date: tomorrowStr, priority: 'low', title: 'Clean desk' }, todayStr);
  // It should fall through to keyword check — "clean" → maintenance
  assert(futureLow === 'maintenance',
    `Due tomorrow + low priority + "clean" → maintenance — got: ${futureLow}`);

  // 1e. Priority urgent → urgent intent
  assert(inferIntent({ priority: 'urgent', title: 'Fix server crash' }, todayStr) === 'urgent',
    'Priority urgent → urgent intent');

  // 1f. Growth keywords → growth
  assert(inferIntent({ title: 'Study for exam', due_date: nextWeekStr }, todayStr) === 'growth',
    '"Study for exam" → growth intent');
  assert(inferIntent({ title: 'Learn React hooks' }, todayStr) === 'growth',
    '"Learn React hooks" → growth intent');
  assert(inferIntent({ title: 'تعلم البرمجة' }, todayStr) === 'growth',
    '"تعلم البرمجة" (Arabic) → growth intent');
  assert(inferIntent({ title: 'Build new feature' }, todayStr) === 'growth',
    '"Build new feature" → growth intent');

  // 1g. Maintenance keywords → maintenance
  assert(inferIntent({ title: 'Clean the house' }, todayStr) === 'maintenance',
    '"Clean the house" → maintenance intent');
  assert(inferIntent({ title: 'Do laundry' }, todayStr) === 'maintenance',
    '"Do laundry" → maintenance intent');
  assert(inferIntent({ title: 'تنظيف الشقة' }, todayStr) === 'maintenance',
    '"تنظيف الشقة" (Arabic) → maintenance intent');
  assert(inferIntent({ title: 'Pay bills' }, todayStr) === 'maintenance',
    '"Pay bills" → maintenance intent');

  // 1h. Recurring task → maintenance
  assert(inferIntent({ title: 'Random thing', is_recurring: true }, todayStr) === 'maintenance',
    'Recurring task → maintenance intent');

  // 1i. Explicit intent field overrides
  assert(inferIntent({ title: 'Study math', intent: 'urgent' }, todayStr) === 'urgent',
    'Explicit intent field overrides keyword inference');

  // 1j. No keywords, no due date → maintenance (default)
  assert(inferIntent({ title: 'do something' }, todayStr) === 'maintenance',
    'Unknown task without due date → maintenance (default)');

  // 1k. No keywords + has due date → deadline
  assert(inferIntent({ title: 'do something', due_date: todayStr }, todayStr) === 'deadline',
    'Unknown task with due date today → deadline');

  // 1l. Null/empty task → maintenance
  assert(inferIntent(null, todayStr) === 'maintenance',
    'Null task → maintenance');
  assert(inferIntent({}, todayStr) === 'maintenance',
    'Empty task → maintenance');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: INTENT SCORING
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 2: Intent Score Modifiers ═══');
{
  const getModifier = brainService._getIntentScoreModifier;
  const highEnergy = { level: 'high', score: 85 };
  const lowEnergy = { level: 'low', score: 30 };
  const mediumEnergy = { level: 'medium', score: 60 };

  // 2a. Deadline always high (90)
  assert(getModifier('deadline', highEnergy) === 90, 'Deadline score = 90 (high energy)');
  assert(getModifier('deadline', lowEnergy) === 90, 'Deadline score = 90 (low energy) — always high');

  // 2b. Urgent always highest (95)
  assert(getModifier('urgent', highEnergy) === 95, 'Urgent score = 95');

  // 2c. Growth varies with energy
  const growthHigh = getModifier('growth', highEnergy);
  const growthMed = getModifier('growth', mediumEnergy);
  const growthLow = getModifier('growth', lowEnergy);
  assert(growthHigh > growthLow, `Growth high energy (${growthHigh}) > low energy (${growthLow})`);
  assert(growthHigh === 70, `Growth high energy = 70 — got: ${growthHigh}`);
  assert(growthLow === 10, `Growth low energy = 10 — got: ${growthLow}`);

  // 2d. Maintenance: bonus for low energy
  const maintLow = getModifier('maintenance', lowEnergy);
  const maintHigh = getModifier('maintenance', highEnergy);
  assert(maintLow > maintHigh, `Maintenance low energy (${maintLow}) > high energy (${maintHigh})`);
  assert(maintLow === 60, `Maintenance low energy = 60 — got: ${maintLow}`);

  // 2e. Priority ordering: urgent > deadline > growth (high) > maintenance (high)
  assert(getModifier('urgent', highEnergy) > getModifier('deadline', highEnergy),
    'Urgent > deadline scoring');
  assert(getModifier('deadline', highEnergy) > getModifier('growth', highEnergy),
    'Deadline > growth (high energy) scoring');
  assert(getModifier('growth', highEnergy) > getModifier('maintenance', highEnergy),
    'Growth (high energy) > maintenance (high energy) scoring');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 3: DAY CONTEXT CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 3: Day Context Classification ═══');
{
  const classify = brainService._classifyDayContext;

  // 3a. EMPTY: no tasks, no habits
  const empty = classify(0, 0, 0, 0);
  assert(empty.classification === 'empty', 'No tasks + no habits → empty');
  assert(empty.isProductive === false, 'Empty day is NOT productive');
  assert(empty.label_ar === 'يوم فارغ', `Empty label = "يوم فارغ" — got: "${empty.label_ar}"`);
  assert(empty.completionRatio === 0, 'Empty day completion ratio = 0');

  // 3b. PRODUCTIVE: had tasks, > 50% completion
  const productive = classify(5, 2, 3, 2);  // 5 completed, 2 pending, 3 habits total, 2 habits done
  assert(productive.classification === 'productive', '5 completed + 2 pending + 2/3 habits → productive');
  assert(productive.isProductive === true, 'Productive day is productive');
  assert(productive.label_ar === 'يوم منتج', `Productive label = "يوم منتج" — got: "${productive.label_ar}"`);
  assert(productive.completionRatio > 50, `Productive completion ratio > 50 — got: ${productive.completionRatio}`);

  // 3c. PRODUCTIVE: >= 3 items completed (even if ratio < 50%)
  const productive2 = classify(3, 10, 0, 0);  // 3 completed, 10 pending, no habits
  assert(productive2.classification === 'productive', '3+ items completed → productive (even if ratio < 50%)');

  // 3d. PARTIAL: had tasks but low completion (< 50% and < 3 completed)
  const partial = classify(1, 8, 2, 0);  // 1 completed, 8 pending, 2 habits, 0 done
  assert(partial.classification === 'partial', '1 completed + 8 pending + 0/2 habits → partial');
  assert(partial.isProductive === false, 'Partial day is NOT productive');
  assert(partial.label_ar === 'يوم جزئي', `Partial label = "يوم جزئي" — got: "${partial.label_ar}"`);

  // 3e. HARD RULE: 0 completed tasks + 0 completed habits but had items → partial (NOT empty)
  const partialZero = classify(0, 5, 3, 0);
  assert(partialZero.classification === 'partial', '0 completed but had tasks/habits → partial (NOT empty)');
  assert(partialZero.isProductive === false, 'Zero completion is NOT productive');

  // 3f. HARD RULE: empty day with zero everything is NOT productive
  const trueEmpty = classify(0, 0, 0, 0);
  assert(trueEmpty.classification === 'empty', 'Zero everything → empty');
  assert(trueEmpty.isProductive === false, 'HARD RULE: empty day is NEVER productive');

  // 3g. Context has all required fields
  const full = classify(3, 2, 4, 3);
  assert(full.hadTasks === true, 'hadTasks is true when tasks exist');
  assert(full.hadHabits === true, 'hadHabits is true when habits exist');
  assert(typeof full.completedTasks === 'number', 'completedTasks is number');
  assert(typeof full.completedHabits === 'number', 'completedHabits is number');
  assert(typeof full.totalItems === 'number', 'totalItems is number');
  assert(typeof full.completedItems === 'number', 'completedItems is number');
  assert(typeof full.completionRatio === 'number', 'completionRatio is number');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 4: END-OF-DAY RESPONSES
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 4: End-of-Day Responses ═══');
{
  const getResponse = brainService._getEndOfDayResponse;
  const classify = brainService._classifyDayContext;

  // 4a. Productive day → positive tone
  const prodCtx = classify(5, 0, 3, 3);
  const prodResp = getResponse(prodCtx, true);
  assert(prodResp.tone === 'positive', `Productive day → positive tone — got: ${prodResp.tone}`);
  assert(prodResp.confidence >= 90, `Productive day → high confidence (${prodResp.confidence})`);
  assert(prodResp.why.some(w => /انجاز|خلصت|شغل/.test(w)), 'Productive response mentions achievements');

  // 4b. Partial day → constructive tone
  const partCtx = classify(1, 4, 2, 0);
  const partResp = getResponse(partCtx, true);
  assert(partResp.tone === 'constructive', `Partial day → constructive tone — got: ${partResp.tone}`);
  assert(partResp.confidence < prodResp.confidence, 'Partial confidence < productive confidence');
  assert(partResp.why.some(w => /تتحسن|خطط|مهام/.test(w)), 'Partial response suggests improvement');

  // 4c. Empty day → neutral tone (NO congratulations)
  const emptyCtx = classify(0, 0, 0, 0);
  const emptyResp = getResponse(emptyCtx, true);
  assert(emptyResp.tone === 'neutral', `Empty day → neutral tone — got: ${emptyResp.tone}`);
  assert(emptyResp.confidence <= 30, `Empty day → low confidence (${emptyResp.confidence})`);
  // HARD RULE: no congratulations for empty days
  const emptyText = JSON.stringify(emptyResp);
  assert(!emptyText.includes('احسنت'), 'HARD RULE: empty day has NO congratulations');
  assert(!emptyText.includes('ممتاز'), 'HARD RULE: empty day has NO "excellent" praise');
  assert(!emptyText.includes('منتج'), 'HARD RULE: empty day NOT called productive');
  assert(emptyResp.why.some(w => /مفيش|ضيف|بكرة/.test(w)), 'Empty response suggests planning/adding tasks');

  // 4d. Productive + not evening → still positive but different message
  const prodRespDay = getResponse(prodCtx, false);
  assert(prodRespDay.tone === 'positive', 'Productive day (not evening) → still positive');

  // 4e. Partial + not evening → suggests continuing
  const partRespDay = getResponse(partCtx, false);
  assert(partRespDay.why.some(w => /وقت|تنجز|ابدا/.test(w)), 'Partial (daytime) suggests continuing work');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 5: INTENT LABELS IN ARABIC
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 5: Intent Labels (Arabic) ═══');
{
  const getLabel = brainService._getIntentLabel;

  assert(getLabel('deadline') === 'موعد نهائي', `deadline → "موعد نهائي" — got: "${getLabel('deadline')}"`);
  assert(getLabel('urgent') === 'عاجل', `urgent → "عاجل" — got: "${getLabel('urgent')}"`);
  assert(getLabel('growth') === 'نمو وتطوير', `growth → "نمو وتطوير" — got: "${getLabel('growth')}"`);
  assert(getLabel('maintenance') === 'صيانة وروتين', `maintenance → "صيانة وروتين" — got: "${getLabel('maintenance')}"`);

  // Arabic text is clean UTF-8
  const allLabels = ['deadline', 'urgent', 'growth', 'maintenance'].map(getLabel).join(' ');
  const hasArabic = /[\u0600-\u06FF]/.test(allLabels);
  assert(hasArabic, 'All intent labels contain Arabic text');
  assert(!allLabels.includes('\uFFFD'), 'No replacement characters in labels');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 6: RECOMPUTE OUTPUT INCLUDES PHASE 12.7 FIELDS
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══ Scenario 6: Recompute Output Fields ═══');
(async () => {
  const userId = 'test-12.7-fields-' + Date.now();
  const state = await brainService.recompute(userId, { type: 'INITIAL_LOAD' });

  // 6a. dayContext field present
  assert(state.dayContext !== undefined, 'dayContext field exists in brainState');
  assert(typeof state.dayContext.classification === 'string', `dayContext.classification is string — got: ${state.dayContext.classification}`);
  assert(['productive', 'partial', 'empty'].includes(state.dayContext.classification),
    `dayContext.classification is one of [productive, partial, empty] — got: ${state.dayContext.classification}`);
  assert(typeof state.dayContext.isProductive === 'boolean', 'dayContext.isProductive is boolean');
  assert(typeof state.dayContext.label_ar === 'string', 'dayContext.label_ar is string');
  assert(typeof state.dayContext.completionRatio === 'number', 'dayContext.completionRatio is number');

  // 6b. Empty day (no mock DB) should be classified as empty
  assert(state.dayContext.classification === 'empty', 'With no DB tasks → empty classification');
  assert(state.dayContext.isProductive === false, 'With no DB tasks → NOT productive');

  // 6c. currentDecision still has all fields
  assert(state.currentDecision !== undefined, 'currentDecision exists');
  assert(typeof state.currentDecision.type === 'string', 'currentDecision.type is string');
  assert(Array.isArray(state.currentDecision.why), 'currentDecision.why is array');
  assert(typeof state.currentDecision.confidence === 'number', 'currentDecision.confidence is number');

  // 6d. Backward compatibility: all Phase 12.5/12.6 fields
  assert(state.reason !== undefined, 'reason field preserved');
  assert(typeof state.riskLevel === 'string', 'riskLevel preserved');
  assert(state.userState !== undefined, 'userState preserved');
  assert(state.adaptiveSignals !== undefined, 'adaptiveSignals preserved');
  assert(state.decisionMemory !== undefined, 'decisionMemory preserved');
  assert(typeof state.lastUpdatedAt === 'string', 'lastUpdatedAt preserved');

  brainService.clearUserState(userId);

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 7: EMPTY DAY NEVER LABELED PRODUCTIVE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ Scenario 7: Empty Day HARD RULES ═══');
  {
    const userId2 = 'test-12.7-empty-' + Date.now();
    const state2 = await brainService.recompute(userId2, { type: 'INITIAL_LOAD' });

    // With no tasks and no habits in DB → empty classification
    assert(state2.dayContext.classification === 'empty', 'Empty day classified as empty');
    assert(state2.dayContext.isProductive === false, 'HARD RULE: empty day is NOT productive');
    
    // Reason should reflect emptiness
    const reason = state2.reason || '';
    assert(!reason.includes('منتج'), 'HARD RULE: empty day reason does NOT say "productive"');
    
    // Decision type should be empty, not reflection
    assert(state2.currentDecision.type !== 'reflection',
      'HARD RULE: empty day does NOT trigger reflection (reflection is for completed work)');

    // Why reasons should suggest action, not praise
    const whyText = (state2.currentDecision.why || []).join(' ');
    assert(!whyText.includes('احسنت'), 'HARD RULE: empty day why does NOT praise');
    assert(whyText.includes('مهم') || whyText.includes('ضيف') || whyText.includes('مفيش') || whyText.includes('ابدا'),
      'Empty day suggests adding tasks or starting');

    brainService.clearUserState(userId2);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 8: GROWTH TASKS AND ENERGY INTERACTION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ Scenario 8: Growth + Energy Interaction ═══');
  {
    const getModifier = brainService._getIntentScoreModifier;

    // Growth at low energy → very low score (don't push)
    const growthLow = getModifier('growth', { level: 'low', score: 25 });
    assert(growthLow <= 15, `Growth at low energy → low modifier (${growthLow} <= 15)`);

    // Growth at high energy → high score (this is the time)
    const growthHigh = getModifier('growth', { level: 'high', score: 85 });
    assert(growthHigh >= 60, `Growth at high energy → high modifier (${growthHigh} >= 60)`);

    // Maintenance at low energy → decent score (good for tired people)
    const maintLow = getModifier('maintenance', { level: 'low', score: 25 });
    assert(maintLow >= 50, `Maintenance at low energy → decent modifier (${maintLow} >= 50)`);

    // Deadline ignores energy — always urgent
    const deadlineLow = getModifier('deadline', { level: 'low', score: 25 });
    assert(deadlineLow >= 85, `Deadline at low energy → still high (${deadlineLow} >= 85)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 9: SPEED — Phase 12.7 additions don't slow recompute
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ Scenario 9: Speed Verification ═══');
  {
    const userId3 = 'test-12.7-speed-' + Date.now();
    const start = Date.now();
    const state3 = await brainService.recompute(userId3, { type: 'INITIAL_LOAD' });
    const elapsed = Date.now() - start;

    assert(elapsed < 2000, `Recompute with Phase 12.7 completed in ${elapsed}ms (< 2000ms)`);
    assert(state3 !== null, 'State is non-null');
    assert(state3.dayContext !== undefined, 'dayContext included in fast path');
    assert(state3.currentDecision !== undefined, 'currentDecision included in fast path');

    brainService.clearUserState(userId3);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO 10: PRODUCTIVE DAY GETS REINFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ Scenario 10: Productive Day Reinforcement ═══');
  {
    const classify = brainService._classifyDayContext;
    const getResponse = brainService._getEndOfDayResponse;

    // Simulate a productive day
    const prodCtx = classify(6, 1, 4, 4);  // 6 completed, 1 pending, 4 habits all done
    const resp = getResponse(prodCtx, true);

    assert(resp.tone === 'positive', 'Productive day gets positive tone');
    assert(resp.confidence >= 90, `Productive day high confidence: ${resp.confidence}`);
    
    // Should mention actual progress
    const whyText = resp.why.join(' ');
    assert(whyText.includes('6') || whyText.includes('خلصت'), 'Productive response mentions completed count');
    assert(whyText.includes('4') || whyText.includes('عادة'), 'Productive response mentions habit count');
    assert(whyText.includes('انجاز') || whyText.includes('شغل'), 'Productive response uses reinforcement language');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log(`Phase 12.7 Tests: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
})().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
