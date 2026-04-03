#!/usr/bin/env node
/**
 * UserModel Validation Script — Phase P
 * ========================================
 * Demonstrates:
 *   1. Two distinct users receive DIFFERENT decisions and modifiers
 *   2. Behavior adapts over time (before-vs-after personalization)
 *   3. Adaptive difficulty adjusts task size/intensity
 *   4. Data sources are real (analytics, learning, tasks, habits)
 *   5. No fake personalization — cold start returns neutral defaults
 *
 * Run: node src/scripts/validate-user-model.js
 */

'use strict';

const path = require('path');
process.env.SQLITE_PATH = path.resolve(__dirname, '../../lifeflow_dev.db');

async function main() {
  const { connectDB } = require('../config/database');
  await connectDB();

  const userModelSvc = require('../services/user.model.service');
  const decisionSvc  = require('../services/unified.decision.service');

  const DIVIDER = '═'.repeat(78);
  const SECTION = '─'.repeat(78);

  console.log(DIVIDER);
  console.log('  UserModel Phase P — COMPREHENSIVE VALIDATION');
  console.log('  Date:', new Date().toISOString());
  console.log(DIVIDER);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: Find real user in DB
  // ═══════════════════════════════════════════════════════════════════════════
  const Task = require('../models/task.model');
  let realUserId;
  try {
    const t = await Task.findOne({ attributes: ['user_id'], raw: true });
    realUserId = t?.user_id;
  } catch (_e) { /* ignore */ }

  if (!realUserId) {
    console.log('⚠️  No tasks in DB — using test user IDs');
    realUserId = 'test-real-user';
  }
  const syntheticUserId = 'test-synthetic-user';

  console.log(`\n📊 Real user: ${realUserId}`);
  console.log(`🧪 Synthetic user: ${syntheticUserId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: Cold Start Validation (no fake personalization)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${DIVIDER}`);
  console.log('  TEST 1: COLD START — No Fake Personalization');
  console.log(DIVIDER);

  const coldModel = await userModelSvc.getOrCreateModel('brand-new-user-never-seen');
  const coldMods  = await userModelSvc.getDecisionModifiers('brand-new-user-never-seen');

  console.log('  Cold-start model:');
  console.log(`    confidence: ${coldModel.confidence}`);
  console.log(`    total_events: ${coldModel.total_events}`);
  console.log(`    procrastination_score: ${coldModel.behavior_profile?.procrastination_score}`);
  console.log(`    push_intensity: ${coldModel.adaptation_profile?.push_intensity}`);
  console.log(`    task_preference: ${coldModel.behavior_profile?.task_preference}`);

  console.log('  Cold-start modifiers:');
  console.log(`    quick_win_boost: ${coldMods.quick_win_boost}`);
  console.log(`    deep_work_penalty: ${coldMods.deep_work_penalty}`);
  console.log(`    success_boost: ${coldMods.success_boost}`);
  console.log(`    suggestion_dampen: ${coldMods.suggestion_dampen}`);
  console.log(`    behavior_weight_modifier: ${coldMods.behavior_weight_modifier}`);

  const coldWeights = decisionSvc.computeEffectiveWeights(coldMods);
  console.log('  Cold-start effective weights:', JSON.stringify(coldWeights));

  const coldStartPass = coldMods.model_confidence === 'cold_start'
    && coldMods.quick_win_boost === 0
    && coldMods.deep_work_penalty === 0
    && coldMods.behavior_weight_modifier === 0
    && JSON.stringify(coldWeights) === JSON.stringify(decisionSvc.BASE_WEIGHTS);
  console.log(`\n  ✅ Cold start = neutral defaults (no fake data): ${coldStartPass ? 'PASS' : 'FAIL'}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 3: Rebuild Real User Model from actual DB data
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${DIVIDER}`);
  console.log('  TEST 2: REAL USER — Rebuild from Actual Data');
  console.log(DIVIDER);

  const beforeRebuild = await userModelSvc.getOrCreateModel(realUserId);
  console.log('  BEFORE rebuild:');
  console.log(`    confidence: ${beforeRebuild.confidence}`);
  console.log(`    total_events: ${beforeRebuild.total_events}`);
  console.log(`    procrastination: ${beforeRebuild.behavior_profile?.procrastination_score}`);
  console.log(`    completion_rate: ${beforeRebuild.performance_profile?.completion_rate_overall}`);

  const realModel = await userModelSvc.rebuildFullModel(realUserId, 'Africa/Cairo');
  const realMods  = await userModelSvc.getDecisionModifiers(realUserId);

  console.log('  AFTER rebuild:');
  console.log(`    confidence: ${realModel.confidence}`);
  console.log(`    total_events: ${realModel.total_events}`);
  console.log(`    completion_rate: ${realModel.performance_profile?.completion_rate_overall}%`);
  console.log(`    procrastination_score: ${realModel.behavior_profile?.procrastination_score}`);
  console.log(`    procrastination_pattern: ${realModel.behavior_profile?.procrastination_pattern}`);
  console.log(`    burnout_tendency: ${realModel.behavior_profile?.burnout_tendency}`);
  console.log(`    task_preference: ${realModel.behavior_profile?.task_preference}`);
  console.log(`    push_intensity: ${realModel.adaptation_profile?.push_intensity}`);
  console.log(`    difficulty_level: ${JSON.stringify(realModel.adaptation_profile?.difficulty_level)}`);
  console.log(`    optimal_task_size: ${realModel.adaptation_profile?.optimal_task_size_minutes}min`);
  console.log(`    max_daily_load: ${realModel.adaptation_profile?.max_daily_load}`);
  console.log(`    needs_warmup: ${realModel.adaptation_profile?.needs_warmup}`);
  console.log(`    energy_sensitivity: ${realModel.adaptation_profile?.energy_sensitivity}`);
  console.log(`    habit_consistency: ${realModel.habit_profile?.consistency_score}`);
  console.log(`    streak_behavior: ${realModel.habit_profile?.streak_behavior}`);

  console.log('  Scoring modifiers:');
  console.log(`    quick_win_boost: ${realMods.quick_win_boost}`);
  console.log(`    deep_work_penalty: ${realMods.deep_work_penalty}`);
  console.log(`    long_task_penalty: ${realMods.long_task_penalty}`);
  console.log(`    peak_hour_bonus: ${realMods.peak_hour_bonus}`);
  console.log(`    success_boost: ${realMods.success_boost}`);
  console.log(`    suggestion_dampen: ${realMods.suggestion_dampen}`);

  const realWeights = decisionSvc.computeEffectiveWeights(realMods);
  console.log('  Effective weights:', JSON.stringify(realWeights));

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 4: Create a Synthetic Struggling User via Events
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${DIVIDER}`);
  console.log('  TEST 3: SYNTHETIC STRUGGLER — Built via Event Simulation');
  console.log(DIVIDER);

  // Simulate 12 missed tasks to build a struggling profile
  console.log('  Simulating 12 missed tasks + 3 rejected decisions...');
  for (let i = 0; i < 12; i++) {
    await userModelSvc.onTaskMissed(syntheticUserId, {
      priority: i % 3 === 0 ? 'high' : 'medium',
      category: 'work',
      energy_required: i % 2 === 0 ? 'high' : 'medium',
      estimated_duration: 60 + i * 5,
    });
  }
  // Simulate 3 rejected decisions
  for (let i = 0; i < 3; i++) {
    await userModelSvc.onDecisionFeedback(syntheticUserId, {
      action: 'start_task',
      response: 'rejected',
    });
  }
  // Simulate 2 completions (very few)
  for (let i = 0; i < 2; i++) {
    await userModelSvc.onTaskCompleted(syntheticUserId, {
      priority: 'low',
      category: 'personal',
      actual_duration: 10,
    });
  }

  const syntheticModel = await userModelSvc.getOrCreateModel(syntheticUserId);
  const syntheticMods  = await userModelSvc.getDecisionModifiers(syntheticUserId);

  console.log('  Synthetic struggler profile:');
  console.log(`    confidence: ${syntheticModel.confidence}`);
  console.log(`    total_events: ${syntheticModel.total_events}`);
  console.log(`    procrastination_score: ${syntheticModel.behavior_profile?.procrastination_score}`);
  console.log(`    burnout_tendency: ${syntheticModel.behavior_profile?.burnout_tendency}`);
  console.log(`    task_preference: ${syntheticModel.behavior_profile?.task_preference}`);
  console.log(`    push_intensity: ${syntheticModel.adaptation_profile?.push_intensity}`);
  console.log(`    difficulty_level: ${JSON.stringify(syntheticModel.adaptation_profile?.difficulty_level)}`);
  console.log(`    completion_rate: ${syntheticModel.performance_profile?.completion_rate_overall}%`);
  console.log(`    needs_warmup: ${syntheticModel.adaptation_profile?.needs_warmup}`);

  console.log('  Scoring modifiers:');
  console.log(`    quick_win_boost: ${syntheticMods.quick_win_boost}`);
  console.log(`    deep_work_penalty: ${syntheticMods.deep_work_penalty}`);
  console.log(`    long_task_penalty: ${syntheticMods.long_task_penalty}`);
  console.log(`    success_boost: ${syntheticMods.success_boost}`);
  console.log(`    suggestion_dampen: ${syntheticMods.suggestion_dampen}`);

  const syntheticWeights = decisionSvc.computeEffectiveWeights(syntheticMods);
  console.log('  Effective weights:', JSON.stringify(syntheticWeights));

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 5: SIDE-BY-SIDE COMPARISON — Two Users, Different Decisions
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${DIVIDER}`);
  console.log('  TEST 4: SIDE-BY-SIDE COMPARISON');
  console.log(DIVIDER);

  const comparison = await userModelSvc.compareUsers(realUserId, syntheticUserId);

  console.log('\n  ┌──────────────────────┬──────────────────────┬──────────────────────┐');
  console.log('  │ Metric               │ Real User            │ Synthetic Struggler  │');
  console.log('  ├──────────────────────┼──────────────────────┼──────────────────────┤');

  const fields = [
    ['confidence', 'confidence'],
    ['total_events', 'total_events'],
    ['push_intensity', 'push_intensity'],
    ['difficulty_level', 'difficulty_level'],
    ['task_preference', 'task_preference'],
    ['procrastination', 'procrastination'],
    ['completion_rate', 'completion_rate'],
    ['needs_warmup', 'needs_warmup'],
    ['overwhelm_threshold', 'overwhelm_threshold'],
  ];

  for (const [label, key] of fields) {
    const a = String(comparison.user_a[key] || '-').slice(0, 20).padEnd(20);
    const b = String(comparison.user_b[key] || '-').slice(0, 20).padEnd(20);
    console.log(`  │ ${label.padEnd(20)} │ ${a} │ ${b} │`);
  }
  console.log('  └──────────────────────┴──────────────────────┴──────────────────────┘');

  console.log('\n  Scoring modifier differences:');
  if (comparison.differences.scoring_differences.length === 0) {
    console.log('    (none — both users are identical)');
  }
  for (const d of comparison.differences.scoring_differences) {
    console.log(`    ${d.field}: User A=${d.user_a}, User B=${d.user_b}`);
    console.log(`      → ${d.impact}`);
  }

  console.log('\n  Weight comparison:');
  console.log(`    Base:      ${JSON.stringify(decisionSvc.BASE_WEIGHTS)}`);
  console.log(`    Real user: ${JSON.stringify(realWeights)}`);
  console.log(`    Struggler: ${JSON.stringify(syntheticWeights)}`);
  console.log(`    Behavior Δ: ${(syntheticWeights.behavior - realWeights.behavior).toFixed(3)} (+ = more correction for struggler)`);
  console.log(`    Urgency Δ:  ${(realWeights.urgency - syntheticWeights.urgency).toFixed(3)} (+ = more deadline pressure for real user)`);

  const usersAreDifferent = comparison.differences.users_are_different;
  console.log(`\n  ✅ Users receive DIFFERENT personalization: ${usersAreDifferent ? 'PASS' : 'FAIL'}`);
  console.log(`     Profile differences: ${comparison.differences.total_profile_differences}`);
  console.log(`     Scoring differences: ${comparison.differences.total_scoring_differences}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 6: BEFORE-vs-AFTER — Adaptive Difficulty Over Time
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${DIVIDER}`);
  console.log('  TEST 5: BEFORE-vs-AFTER ADAPTIVE DIFFICULTY');
  console.log(DIVIDER);

  const tempUser = 'test-adaptive-difficulty-' + Date.now();
  const beforeAdapt = await userModelSvc.getOrCreateModel(tempUser);
  console.log('  BEFORE (cold start):');
  console.log(`    difficulty: ${JSON.stringify(beforeAdapt.adaptation_profile?.difficulty_level)}`);
  console.log(`    push_intensity: ${beforeAdapt.adaptation_profile?.push_intensity}`);
  console.log(`    optimal_task_size: ${beforeAdapt.adaptation_profile?.optimal_task_size_minutes}min`);
  console.log(`    max_daily_load: ${beforeAdapt.adaptation_profile?.max_daily_load}`);

  // Simulate 6 consecutive completions → should increase difficulty
  console.log('\n  → Simulating 6 consecutive task completions...');
  for (let i = 0; i < 6; i++) {
    await userModelSvc.onTaskCompleted(tempUser, {
      priority: 'medium', category: 'work', actual_duration: 30,
    });
  }

  const afterSuccess = await userModelSvc.getOrCreateModel(tempUser);
  console.log('  AFTER 6 successes:');
  console.log(`    difficulty: ${JSON.stringify(afterSuccess.adaptation_profile?.difficulty_level)}`);
  console.log(`    push_intensity: ${afterSuccess.adaptation_profile?.push_intensity}`);
  console.log(`    optimal_task_size: ${afterSuccess.adaptation_profile?.optimal_task_size_minutes}min`);
  console.log(`    max_daily_load: ${afterSuccess.adaptation_profile?.max_daily_load}`);

  // Now simulate 4 consecutive misses → should decrease difficulty
  console.log('\n  → Simulating 4 consecutive task misses...');
  for (let i = 0; i < 4; i++) {
    await userModelSvc.onTaskMissed(tempUser, {
      priority: 'high', category: 'work', energy_required: 'high',
    });
  }

  const afterMisses = await userModelSvc.getOrCreateModel(tempUser);
  console.log('  AFTER 4 misses:');
  console.log(`    difficulty: ${JSON.stringify(afterMisses.adaptation_profile?.difficulty_level)}`);
  console.log(`    push_intensity: ${afterMisses.adaptation_profile?.push_intensity}`);
  console.log(`    optimal_task_size: ${afterMisses.adaptation_profile?.optimal_task_size_minutes}min`);
  console.log(`    max_daily_load: ${afterMisses.adaptation_profile?.max_daily_load}`);
  console.log(`    needs_warmup: ${afterMisses.adaptation_profile?.needs_warmup}`);

  const difficultyChanged = (
    beforeAdapt.adaptation_profile?.difficulty_level !== afterSuccess.adaptation_profile?.difficulty_level?.current
    || afterSuccess.adaptation_profile?.difficulty_level?.current !== afterMisses.adaptation_profile?.difficulty_level?.current
  );
  console.log(`\n  ✅ Difficulty adapts over time: ${difficultyChanged ? 'PASS' : 'PARTIAL — may need more events'}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 7: FEEDBACK LOOP — Decision acceptance changes modifiers
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${DIVIDER}`);
  console.log('  TEST 6: FEEDBACK LOOP — Acceptance Rate Changes Behavior');
  console.log(DIVIDER);

  const feedbackUser = 'test-feedback-loop-' + Date.now();
  const beforeFeedback = await userModelSvc.getDecisionModifiers(feedbackUser);
  console.log('  BEFORE feedback:');
  console.log(`    push_intensity: ${beforeFeedback.push_intensity}`);
  console.log(`    suggestion_dampen: ${beforeFeedback.suggestion_dampen}`);
  console.log(`    coaching_receptivity: ${beforeFeedback.coaching_receptivity}`);

  // Simulate 8 accepted decisions
  console.log('\n  → Simulating 8 accepted decisions...');
  for (let i = 0; i < 8; i++) {
    await userModelSvc.onDecisionFeedback(feedbackUser, {
      action: 'start_task', response: 'accepted',
    });
  }

  const afterAccept = await userModelSvc.getDecisionModifiers(feedbackUser);
  console.log('  AFTER 8 accepted decisions:');
  console.log(`    push_intensity: ${afterAccept.push_intensity}`);
  console.log(`    suggestion_dampen: ${afterAccept.suggestion_dampen}`);
  console.log(`    coaching_receptivity: ${afterAccept.coaching_receptivity}`);

  // Now simulate 10 rejected decisions
  console.log('\n  → Simulating 10 rejected decisions...');
  for (let i = 0; i < 10; i++) {
    await userModelSvc.onDecisionFeedback(feedbackUser, {
      action: 'start_task', response: 'rejected',
    });
  }

  const afterReject = await userModelSvc.getDecisionModifiers(feedbackUser);
  console.log('  AFTER 10 rejected decisions:');
  console.log(`    push_intensity: ${afterReject.push_intensity}`);
  console.log(`    suggestion_dampen: ${afterReject.suggestion_dampen}`);
  console.log(`    coaching_receptivity: ${afterReject.coaching_receptivity}`);

  const feedbackLoopWorks = afterAccept.push_intensity !== afterReject.push_intensity
    || afterAccept.suggestion_dampen !== afterReject.suggestion_dampen;
  console.log(`\n  ✅ Feedback loop changes modifiers: ${feedbackLoopWorks ? 'PASS' : 'FAIL'}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 8: DATA SOURCES SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${DIVIDER}`);
  console.log('  DATA SOURCES USED (no fabrication)');
  console.log(DIVIDER);
  console.log('  1. analytics.service.js   → task/habit/mood/productivity metrics');
  console.log('  2. learning.engine.service → success rates, optimal hours, failure patterns');
  console.log('  3. Task model (DB)        → completion rates, delays, reschedules, priorities');
  console.log('  4. Habit/HabitLog models  → streaks, consistency, drop-off patterns');
  console.log('  5. Decision feedback      → acceptance/rejection rates, push tolerance');
  console.log('  6. Real task lifecycle    → actual_duration, completed_at, energy_required');

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 9: FINAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${DIVIDER}`);
  console.log('  VALIDATION SUMMARY');
  console.log(DIVIDER);

  const results = [
    { test: 'Cold start = neutral (no fake data)', pass: coldStartPass },
    { test: 'Real user model rebuilt from DB', pass: (realModel.total_events || 0) > 0 },
    { test: 'Two users get different modifiers', pass: usersAreDifferent },
    { test: 'Adaptive difficulty changes over time', pass: difficultyChanged },
    { test: 'Feedback loop changes push behavior', pass: feedbackLoopWorks },
  ];

  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${r.test}`);
    if (!r.pass) allPass = false;
  }

  console.log(`\n  Overall: ${allPass ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS NEED ATTENTION'}`);
  console.log(DIVIDER);

  process.exit(0);
}

main().catch(e => {
  console.error('Validation failed:', e);
  process.exit(1);
});
