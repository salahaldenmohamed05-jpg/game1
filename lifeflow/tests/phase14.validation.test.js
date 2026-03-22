/**
 * Phase 14 Validation Tests — اختبارات التحقق الشاملة
 * =====================================================
 * Tests all AI layers end-to-end:
 *  - AI Chat (all fields present, no crashes)
 *  - Learning Engine (record + profile)
 *  - Prediction Engine (probability outputs)
 *  - Planning Engine (daily plan)
 *  - Decision Engine (confidence + explanation)
 *  - Context Snapshot (energy, mood, signals)
 *  - Execution Dispatcher (executor routing)
 *  - Virtual Assistant (action execution)
 *  - Adaptive Behavior (policy adaptation)
 *  - Execution Policy (3 autonomy levels)
 *  - Orchestrator (full pipeline)
 */

'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);
// Patch require to use ROOT-relative paths
const Module = require('module');
const _resolveFilename = Module._resolveFilename.bind(Module);
Module._resolveFilename = (request, parent, isMain, options) => {
  return _resolveFilename(request, parent, isMain, options);
};

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
    errors.push({ name, error: err.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertShape(obj, keys, label = '') {
  for (const key of keys) {
    if (obj[key] === undefined) {
      throw new Error(`Missing key '${key}' in ${label || JSON.stringify(Object.keys(obj))}`);
    }
  }
}

async function runTests() {
  const TEST_USER = 'test-phase14-' + Date.now();

  console.log('\n══════════════════════════════════════════════');
  console.log('   LifeFlow Phase 14 — Full Validation Tests');
  console.log('══════════════════════════════════════════════\n');

  // ─── PHASE 8: Execution Policy ─────────────────────────────────────────────
  console.log('── Phase 8: Execution Policy ──');
  const policy = require('../backend/src/config/execution.policy');

  await test('AUTONOMY constants defined', () => {
    assert(policy.AUTONOMY.PASSIVE    === 1, 'PASSIVE=1');
    assert(policy.AUTONOMY.SUGGESTIVE === 2, 'SUGGESTIVE=2');
    assert(policy.AUTONOMY.ACTIVE     === 3, 'ACTIVE=3');
  });

  await test('evaluate() - Level 1 passive never auto-executes', () => {
    const r = policy.evaluate('create_task', { aiMode: 'passive' });
    assert(r.shouldAutoExecute === false, 'passive should not auto-execute');
    assert(r.shouldSuggest === true, 'passive should suggest');
  });

  await test('evaluate() - Level 2 suggestive auto-executes LOW', () => {
    const r = policy.evaluate('create_task', { aiMode: 'suggestive' });
    assert(r.shouldAutoExecute === true, 'suggestive LOW should auto-execute');
  });

  await test('evaluate() - Level 2 suggestive suggests MEDIUM', () => {
    const r = policy.evaluate('reschedule_task', { aiMode: 'suggestive' });
    assert(r.shouldAutoExecute === false, 'suggestive MEDIUM should not auto-execute');
    assert(r.shouldSuggest === true, 'suggestive MEDIUM should suggest');
  });

  await test('evaluate() - Level 3 active auto-executes MEDIUM', () => {
    const r = policy.evaluate('reschedule_task', { aiMode: 'active' });
    assert(r.shouldAutoExecute === true, 'active MEDIUM should auto-execute');
  });

  await test('evaluate() - HIGH always requires confirmation', () => {
    const r = policy.evaluate('delete_task', { aiMode: 'active' });
    assert(r.requiresConfirmation === true, 'delete always requires confirmation');
    assert(r.shouldAutoExecute === false, 'delete should not auto-execute even in active mode');
  });

  await test('setUserAutonomy / getUserAutonomy round-trip', () => {
    policy.setUserAutonomy(TEST_USER, 'active');
    assert(policy.getUserAutonomy(TEST_USER) === 3, 'active→3');
    policy.setUserAutonomy(TEST_USER, 'passive');
    assert(policy.getUserAutonomy(TEST_USER) === 1, 'passive→1');
    policy.setUserAutonomy(TEST_USER, 'suggestive');
  });

  // ─── PHASE 2: Learning Engine ──────────────────────────────────────────────
  console.log('\n── Phase 2: Learning Engine ──');
  const learning = require('../backend/src/services/learning.engine.service');

  await test('recordDecision does not throw', () => {
    learning.recordDecision(TEST_USER, { action: 'create_task', risk: 'low', energy: 70, mood: 7, mode: 'manager', intent: 'task_action' });
    learning.recordDecision(TEST_USER, { action: 'complete_task', risk: 'low', energy: 80, mood: 8 });
    learning.recordDecision(TEST_USER, { action: 'create_task', risk: 'low', energy: 60, mood: 6 });
  });

  await test('recordOutcome does not throw', () => {
    learning.recordOutcome(TEST_USER, { action: 'create_task', success: true,  energy: 70, mood: 7 });
    learning.recordOutcome(TEST_USER, { action: 'create_task', success: false, energy: 30, mood: 4 });
    learning.recordOutcome(TEST_USER, { action: 'complete_task', success: true, energy: 80, mood: 8 });
    learning.recordOutcome(TEST_USER, { action: 'complete_task', success: true, energy: 75, mood: 7 });
  });

  await test('getUserLearningProfile returns valid shape', () => {
    const profile = learning.getUserLearningProfile(TEST_USER);
    assert(typeof profile === 'object', 'profile is object');
    assert(Array.isArray(profile.insights), 'insights is array');
    // getUserLearningProfile may use camelCase keys from computeStats
    assert(profile.insights !== undefined, 'insights present');
    // Either 'successRates' or nested 'stats.successRates' form is valid
    const hasRates = profile.successRates !== undefined || profile.success_rates !== undefined
      || (profile.stats && profile.stats.successRates !== undefined);
    assert(hasRates, 'success rates present in profile or profile.stats');
  });

  await test('getLearningStats returns successRates', () => {
    const stats = learning.getLearningStats(TEST_USER);
    assert(typeof stats.successRates === 'object', 'successRates is object');
  });

  // ─── PHASE 1: Context Snapshot ─────────────────────────────────────────────
  console.log('\n── Phase 1: Context Snapshot ──');
  const ctxService = require('../backend/src/services/context.snapshot.service');

  await test('generateSnapshot does not throw', async () => {
    // This needs DB, so we just test it doesn't hard-crash
    const snap = await ctxService.generateSnapshot(TEST_USER, 'Africa/Cairo');
    assert(typeof snap === 'object', 'snapshot is object');
    assertShape(snap, ['time', 'energy', 'mood', 'signals'], 'snapshot');
  });

  await test('getOrGenerateSnapshot alias works', async () => {
    const snap = await ctxService.getOrGenerateSnapshot(TEST_USER, 'Africa/Cairo');
    assert(snap !== null && snap !== undefined, 'snapshot not null');
  });

  await test('toPromptContext returns non-empty string', async () => {
    const snap = await ctxService.generateSnapshot(TEST_USER, 'Africa/Cairo');
    const ctx  = ctxService.toPromptContext(snap);
    assert(typeof ctx === 'string' && ctx.length > 0, 'prompt context is non-empty string');
  });

  // ─── PHASE 6: Explainability ───────────────────────────────────────────────
  console.log('\n── Phase 6: Explainability ──');
  const explainability = require('../backend/src/services/explainability.service');

  await test('explainDecision returns confidence + why[]', () => {
    const result = explainability.explainDecision({
      action: 'complete_task',
      userId: TEST_USER,
      energy: 80,
      mood  : 8,
      priority: 'high',
      risk  : 'low',
      overdueCount: 2,
    });
    assert(typeof result.confidence === 'number', 'confidence is number');
    assert(Array.isArray(result.why), 'why is array');
    assert(result.why.length > 0, 'why has items');
    assert(result.confidence >= 0 && result.confidence <= 100, 'confidence in 0-100');
  });

  await test('explainDecision works with low energy (warns)', () => {
    const result = explainability.explainDecision({
      action: 'create_task',
      userId: TEST_USER,
      energy: 15,
      mood  : 3,
      priority: 'low',
      risk  : 'low',
    });
    assert(typeof result.confidence === 'number', 'returns confidence even for low energy');
    assert(Array.isArray(result.why), 'has why array');
  });

  // ─── PHASE 7: Adaptive Behavior ────────────────────────────────────────────
  console.log('\n── Phase 7: Adaptive Behavior ──');
  const adaptive = require('../backend/src/services/adaptive.behavior.service');

  await test('recordInteraction updates behavior', () => {
    adaptive.recordInteraction(TEST_USER, 'overdue_tasks', 'accepted');
    adaptive.recordInteraction(TEST_USER, 'energy_drop',   'rejected');
    const b = adaptive.getBehavior(TEST_USER);
    assert(b.totalInteractions >= 2, 'totalInteractions incremented');
  });

  await test('getAdaptiveSuggestions returns array', () => {
    const suggestions = adaptive.getAdaptiveSuggestions(TEST_USER, 'task_action');
    assert(Array.isArray(suggestions), 'suggestions is array');
    assert(suggestions.length > 0, 'at least one suggestion');
  });

  await test('adaptPolicy returns recommendation', () => {
    const result = adaptive.adaptPolicy(TEST_USER);
    assert(typeof result === 'object', 'returns object');
    assertShape(result, ['recommended_level', 'reason', 'changed'], 'policy adaptation');
  });

  await test('getPolicyStatus returns level + mode + label', () => {
    const status = adaptive.getPolicyStatus(TEST_USER);
    assertShape(status, ['level', 'mode', 'label'], 'policy status');
    assert(typeof status.level === 'number', 'level is number');
  });

  // ─── PHASE 9: Execution Dispatcher ────────────────────────────────────────
  console.log('\n── Phase 9: Execution Dispatcher ──');
  const dispatcher = require('../backend/src/services/execution.dispatcher.service');

  await test('dispatch create_task → system executor', () => {
    const result = dispatcher.dispatch({
      action        : 'create_task',
      userId        : TEST_USER,
      risk          : 'low',
      policyLevel   : 'suggestive',
      confidence    : 80,
      acceptanceRate: 70,
      payload       : { title: 'Test Task' },
    });
    assertShape(result, ['executor', 'requires_confirmation', 'auto_execute', 'reason'], 'dispatch result');
    assert(result.executor === 'system', 'create_task → system');
  });

  await test('dispatch schedule_meeting → virtual_assistant', () => {
    const result = dispatcher.dispatch({
      action        : 'schedule_meeting',
      userId        : TEST_USER,
      risk          : 'medium',
      policyLevel   : 'active',
      confidence    : 75,
      acceptanceRate: 60,
      payload       : {},
    });
    assert(result.executor === 'virtual_assistant', `schedule_meeting → VA (got: ${result.executor})`);
  });

  await test('dispatch high-risk → user confirmation', () => {
    const result = dispatcher.dispatch({
      action        : 'delete_task',
      userId        : TEST_USER,
      risk          : 'high',
      policyLevel   : 'active',
      confidence    : 90,
      acceptanceRate: 80,
      payload       : { id: '123' },
    });
    assert(result.requires_confirmation === true, 'delete → requires_confirmation');
  });

  // ─── PHASE 10: Virtual Assistant ───────────────────────────────────────────
  console.log('\n── Phase 10: Virtual Assistant ──');
  const va = require('../backend/src/services/virtual.assistant.service');

  await test('execute research_topic returns success', async () => {
    const result = await va.execute({
      action      : 'research_topic',
      instructions: { topic: 'time management' },
      priority    : 'medium',
      userId      : TEST_USER,
      timezone    : 'Africa/Cairo',
    });
    assertShape(result, ['status', 'result', 'notes', 'executed_at', 'action_id'], 'va result');
    assert(result.status === 'success', `status should be success (got: ${result.status})`);
  });

  await test('execute draft_message returns success', async () => {
    const result = await va.execute({
      action      : 'draft_message',
      instructions: { subject: 'Meeting Request', recipient: 'Team' },
      priority    : 'low',
      userId      : TEST_USER,
      timezone    : 'Africa/Cairo',
    });
    assert(result.status === 'success', `draft_message success (got: ${result.status})`);
  });

  await test('getActionHistory returns array', () => {
    const history = va.getActionHistory(TEST_USER, 10);
    assert(Array.isArray(history), 'history is array');
  });

  // ─── PHASE 3: Prediction Engine ────────────────────────────────────────────
  console.log('\n── Phase 3: Prediction Engine ──');
  const prediction = require('../backend/src/services/prediction.service');

  await test('getProbabilisticPrediction returns required fields', async () => {
    const result = await prediction.getProbabilisticPrediction(TEST_USER, 'Africa/Cairo');
    assertShape(result, ['task_completion_probability', 'burnout_risk', 'focus_score'], 'prediction');
    assert(result.task_completion_probability >= 0 && result.task_completion_probability <= 1, 'probability 0-1');
    assert(result.burnout_risk >= 0 && result.burnout_risk <= 1, 'burnout 0-1');
    assert(result.focus_score >= 0 && result.focus_score <= 100, 'focus 0-100');
  });

  // ─── PHASE 11: Assistant Presenter ─────────────────────────────────────────
  console.log('\n── Phase 11: Assistant Presenter ──');
  const presenter = require('../backend/src/services/assistant.presenter.service');

  await test('presentReply returns card with correct shape', () => {
    const card = presenter.presentReply({
      reply      : 'مرحباً صديقي',
      mode       : 'hybrid',
      is_fallback: false,
    });
    assertShape(card, ['type', 'title', 'message', 'icon'], 'reply card');
  });

  await test('presentOrchestration returns array of cards', () => {
    // The function is exported as 'presentOrchestration'
    const fn = presenter.presentOrchestration || presenter.presentOrchestrationResult;
    assert(typeof fn === 'function', 'presentOrchestration function exists');
    const cards = fn({
      reply       : 'اليوم لديك 3 مهام',
      mode        : 'manager',
      actions     : [{ type: 'task_created', data: { title: 'مهمة جديدة' } }],
      suggestions : ['كيف حالي؟', 'خطة اليوم'],
      is_fallback : false,
      explanation : ['الطاقة عالية'],
      planningTip : 'ابدأ بالمهام ذات الأولوية العالية',
    });
    // Can return array or single object
    const result = Array.isArray(cards) ? cards : [cards];
    assert(result.length > 0, 'at least one card');
  });

  // ─── PHASE 13: Orchestrator ────────────────────────────────────────────────
  console.log('\n── Phase 13: Orchestrator (Full Pipeline) ──');
  const orchestrator = require('../backend/src/services/orchestrator.service');

  await test('companionChat returns required shape', async () => {
    const result = await orchestrator.companionChat(
      TEST_USER,
      'كيف حالك؟',
      'Africa/Cairo',
      null
    );
    assertShape(result, ['reply', 'mode', 'actions', 'suggestions', 'is_fallback'], 'orchestrator result');
    assert(typeof result.reply === 'string' && result.reply.length > 0, 'reply is non-empty string');
    assert(Array.isArray(result.actions), 'actions is array');
    assert(Array.isArray(result.suggestions), 'suggestions is array');
    assert(typeof result.is_fallback === 'boolean', 'is_fallback is boolean');
  });

  await test('orchestrate never returns undefined/null reply', async () => {
    const result = await orchestrator.orchestrate({
      userId        : TEST_USER,
      message       : 'اضف مهمة تجربة',
      timezone      : 'Africa/Cairo',
      intentCategory: 'task_action',
    });
    assert(result.reply !== undefined && result.reply !== null, 'reply not null/undefined');
    assert(result.reply !== '', 'reply not empty');
  });

  await test('orchestrate handles errors gracefully (always returns reply)', async () => {
    const result = await orchestrator.orchestrate({
      userId        : null,
      message       : '?',
      timezone      : 'Africa/Cairo',
    });
    // Should return fallback, never throw
    assert(result !== null && result !== undefined, 'result not null');
    assert(typeof result.reply === 'string', 'reply is string even on error');
  });

  // ─── AI ERROR HANDLER ──────────────────────────────────────────────────────
  console.log('\n── Phase 0: AI Error Handler ──');
  const { safeExecute, validateResponse, safeParseJSON, ERROR_TYPES } = require('../backend/src/services/ai/ai.error.handler');

  await test('safeExecute catches errors, returns fallback', async () => {
    const result = await safeExecute(async () => { throw new Error('AI_TIMEOUT: test'); });
    assert(result.is_fallback === true, 'is_fallback on error');
    assert(typeof result.reply === 'string' && result.reply.length > 0, 'non-empty fallback reply');
    assert(result.error_type !== undefined, 'error_type set');
  });

  await test('safeExecute returns reply when success', async () => {
    const result = await safeExecute(async () => 'مرحباً!');
    assert(result.is_fallback === false, 'not fallback');
    assert(result.reply === 'مرحباً!', 'correct reply returned');
  });

  await test('validateResponse handles null/undefined safely', () => {
    assert(typeof validateResponse(null) === 'string', 'null → string fallback');
    assert(typeof validateResponse(undefined) === 'string', 'undefined → string fallback');
    assert(typeof validateResponse('') === 'string', 'empty → string fallback');
    assert(validateResponse('hello') === 'hello', 'passes through valid string');
  });

  await test('safeParseJSON handles malformed JSON', () => {
    assert(safeParseJSON(null) === null, 'null → null');
    assert(safeParseJSON('not json') === null, 'invalid → null');
    assert(safeParseJSON('{"key":"val"}')?.key === 'val', 'valid JSON parsed');
    assert(safeParseJSON('text {"key":"val"} more')?.key === 'val', 'extracts JSON from text');
  });

  await test('ERROR_TYPES all defined', () => {
    const required = ['TIMEOUT', 'RATE_LIMIT', 'KEY_MISSING', 'PARSE_FAIL', 'NETWORK', 'UNKNOWN'];
    for (const t of required) {
      assert(ERROR_TYPES[t] !== undefined, `ERROR_TYPES.${t} defined`);
    }
  });

  // ─── PART B: ML Self-Learning Functions ───────────────────────────────────
  console.log('\n── Part B: ML Self-Learning Engine ──');
  // Seed learning data for this section
  const ML_USER = 'ml-test-' + Date.now();
  for (let i = 0; i < 10; i++) {
    learning.recordOutcome(ML_USER, {
      action : i % 2 === 0 ? 'create_task' : 'complete_task',
      success: i < 7,
      energy : 50 + i * 5,
      mood   : 4 + (i % 5),
      hour   : 8 + i,
    });
  }

  await test('calculateSuccessRate returns 0-1 for filtered logs', () => {
    const stats = learning.getLearningStats(ML_USER);
    const allOutcomes = learning.getLearningStats(ML_USER);
    // Use the internal function via exported calculateSuccessRate
    const rate = learning.calculateSuccessRate(
      [{ success: true }, { success: true }, { success: false }]
    );
    assert(rate >= 0 && rate <= 1, 'rate is 0-1: ' + rate);
    assert(Math.abs(rate - 0.667) < 0.01, 'rate correct: ' + rate);
  });

  await test('calculateSuccessRate with filter works', () => {
    const logs = [
      { success: true,  hour: 9 },
      { success: true,  hour: 10 },
      { success: false, hour: 20 },
      { success: false, hour: 21 },
    ];
    const morningRate = learning.calculateSuccessRate(logs, r => r.hour < 12);
    assert(morningRate === 1.0, 'morning: 100% - got: ' + morningRate);
    const eveningRate = learning.calculateSuccessRate(logs, r => r.hour >= 18);
    assert(eveningRate === 0.0, 'evening: 0% - got: ' + eveningRate);
  });

  await test('scoreDecision returns 0-100 score', () => {
    const highPriUrgent  = learning.scoreDecision('urgent', 0, 0.9, 0.8);
    const lowPriSomeday  = learning.scoreDecision('low', 30, 0.3, 0.4);
    assert(highPriUrgent > 70, 'urgent overdue score > 70: ' + highPriUrgent);
    assert(lowPriSomeday < 50, 'low priority someday score < 50: ' + lowPriSomeday);
    assert(highPriUrgent >= 0 && highPriUrgent <= 100, 'score in range');
  });

  await test('predictTaskCompletion returns 0-1 probability', () => {
    const prob = learning.predictTaskCompletion(
      { priority: 'high', action: 'complete_task' },
      { energy: 75, mood: 8, hour: 10 },
      ML_USER
    );
    assert(prob >= 0 && prob <= 1, 'probability 0-1: ' + prob);
    assert(typeof prob === 'number', 'probability is number');
  });

  await test('predictTaskCompletion heuristic for new user', () => {
    const newUser = 'brand-new-user-' + Date.now();
    const prob = learning.predictTaskCompletion(
      { priority: 'high', action: 'complete_task' },
      { energy: 60, mood: 7, hour: 9 },
      newUser
    );
    // Should return a heuristic baseline for unknown user
    assert(prob > 0.5 && prob < 1.0, 'high priority heuristic: ' + prob);
  });

  await test('detectBurnoutRisk returns 0-1 risk', () => {
    const lowRisk  = learning.detectBurnoutRisk(ML_USER, { mood: 8, overdueCount: 0 });
    const highRisk = learning.detectBurnoutRisk(ML_USER, { mood: 2, overdueCount: 8 });
    assert(lowRisk  >= 0 && lowRisk  <= 1, 'low risk in 0-1: '  + lowRisk);
    assert(highRisk >= 0 && highRisk <= 1, 'high risk in 0-1: ' + highRisk);
    assert(highRisk >= lowRisk, 'high context has more risk than low: ' + highRisk + ' >= ' + lowRisk);
  });

  await test('getMLPredictions returns full prediction bundle', () => {
    const ml = learning.getMLPredictions(ML_USER, { energy: 65, mood: 7, hour: 10 });
    assert(typeof ml === 'object', 'predictions is object');
    assert(ml.task_completion_probability >= 0 && ml.task_completion_probability <= 1,
      'task prob 0-1: ' + ml.task_completion_probability);
    assert(ml.burnout_risk >= 0 && ml.burnout_risk <= 1,
      'burnout risk 0-1: ' + ml.burnout_risk);
    assert(ml.focus_score >= 0 && ml.focus_score <= 100,
      'focus score 0-100: ' + ml.focus_score);
    assert(Array.isArray(ml.best_focus_hours),
      'best_focus_hours is array');
    assert(typeof ml.confidence === 'string',
      'confidence is string label: ' + ml.confidence);
    assert(typeof ml.success_rates === 'object', 'success_rates is object');
  });

  await test('getMLPredictions for new user returns safe defaults', () => {
    const freshUser = 'fresh-' + Date.now();
    const ml = learning.getMLPredictions(freshUser, {});
    assert(ml.task_completion_probability >= 0 && ml.task_completion_probability <= 1,
      'fresh user task prob valid: ' + ml.task_completion_probability);
    assert(ml.confidence === 'insufficient', 'fresh user: insufficient confidence');
    assert(Array.isArray(ml.best_focus_hours), 'fresh user has best_focus_hours array');
  });

  // ─── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  console.log(`   Results: ${passed} PASS, ${failed} FAIL`);
  if (errors.length > 0) {
    console.log('\n   Failures:');
    errors.forEach(e => console.log(`     • ${e.name}: ${e.error}`));
  }
  console.log('══════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
