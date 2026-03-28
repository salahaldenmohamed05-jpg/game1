# LifeFlow System Map - Step 0
## Generated: 2026-03-28

---

## 1. AI Core Architecture

### Entry Point: `ai.core.service.js`
Single unified AI gateway. All routes call ONLY this service.

```
Routes ─> ai.core.service.js ─┬─> commandEngine (ai.command.engine.js)
                               ├─> orchestrator (orchestrator.service.js)
                               ├─> conversationSvc (conversation.service.js)
                               ├─> dayPlanner (dayplanner.service.js) [lazy]
                               ├─> prediction (prediction.service.js) [lazy]
                               ├─> coaching (ai.coach.service.js) [lazy]
                               └─> proactiveEngine (proactive.engine.service.js) [lazy]
```

**Exported Methods**: chat, command, plan, predict, coach, proactive, autonomous, status, context, history, clearHistory, simpleChat, fallback, detectIntent, classifyIntent, fetchUserContext

### Command Engine: `ai.command.engine.js`
- Classifies intent (task_action / question / advice / general)
- Detects specific intent via AI (JSON prompt)
- Executes actions: create_task, complete_task, reschedule_task, delete_task, log_mood, plan_day, schedule_exam, schedule_plan, life_summary, analyze
- Builds user context (tasks, mood, habits, profile, settings)
- Handles pending confirmations

### Orchestrator: `orchestrator.service.js`
Full AI pipeline: Context Snapshot -> Learning -> Prediction -> Planning -> Decision -> Explainability -> Dispatch -> Execute -> Feedback -> Learn
- Mode detection (companion / manager / hybrid)
- Context block builder (energy, mood, tasks, habits, time)
- Adaptive suggestions via `adaptive.behavior.service.js`

---

## 2. Data Models

| Model | Table | Status | Used By |
|-------|-------|--------|---------|
| Task | tasks | ACTIVE | command engine, planning, scheduling, dashboard |
| Habit / HabitLog | habits / habit_logs | ACTIVE | scheduler, dashboard, planning |
| MoodEntry | mood_entries | ACTIVE | context snapshot, energy service, behavior model |
| BehaviorProfile | behavior_profiles | SCHEMA EXISTS, NEVER POPULATED | behavior.model.service (dead code) |
| BehaviorPattern | behavior_patterns | SCHEMA EXISTS, NEVER POPULATED | no active writer |
| DayPlan | day_plans | ACTIVE | dayplanner.service persists plans |
| EnergyProfile | energy_profiles | ACTIVE | energy.service builds from task history |
| Goal | goals | SCHEMA EXISTS | dashboard fetches, no active engine |
| ProductivityScore | productivity_scores | SCHEMA EXISTS | behavior.model.service reads |
| BehavioralFlag | behavioral_flags | SCHEMA EXISTS | behavior.model.service reads, energy.service reads |
| EnergyLog | energy_logs | SCHEMA EXISTS | behavior.model.service reads |
| LearningOutcome | learning_outcomes | ACTIVE | learning.engine.service persists |
| WeeklyAudit | weekly_audits | ACTIVE | weekly-audit.service |
| ChatSession / ChatMessage | chat_sessions / chat_messages | ACTIVE | assistant routes |
| User | users | ACTIVE | everywhere |
| CoachSession | coach_sessions | SCHEMA EXISTS | coaching.service |
| Notification | notifications | ACTIVE | scheduler.service |

---

## 3. Service Layer Map

### Behavior System (BROKEN)
- `behavior.model.service.js` - buildBehaviorModel() - **BUG: return statement BEFORE persist block (line 113 returns, lines 143-163 are dead code)**
- `adaptive.behavior.service.js` - In-memory only behavior tracking (suggestion acceptance/rejection). No DB persistence. No connection to behavior_profiles/patterns.

### Planning System (PARTIALLY WORKING)
- `planning.engine.service.js` - In-memory daily/weekly plan generator. No DB persistence. Uses learning.engine for optimal hours. Cache-only (10 min TTL).
- `dayplanner.service.js` - Full day plan builder with energy curve, task scheduling, mood adjustments. DOES persist to day_plans table.
- `scheduling.engine.service.js` - ML-enhanced scheduling. Builds time slots with ML context. No DB persistence.

### Learning System (WORKING)
- `learning.engine.service.js` - Records decisions/outcomes, computes success rates, optimal hours, burnout risk. In-memory + DB persist (fire-and-forget).

### Energy System (WORKING)
- `energy.service.js` - Builds EnergyProfile from task completion history. Computes daily energy score. Persists to energy_profiles table.

### Decision System (WORKING)
- `decision.engine.service.js` - Evaluates proposals with confidence scoring, risk assessment, learning insights. Executes task actions.
- `execution.dispatcher.service.js` - Routes actions to system/user/VA based on policy level. In-memory policy store.

### Context System (WORKING)
- `context.snapshot.service.js` - Real-time user context (energy, mood, tasks, habits, signals). In-memory ring buffer.

---

## 4. Identified GAPS

### GAP-1: behavior_profiles table NEVER populated
**Root Cause**: In `behavior.model.service.js` line 113, the function returns the result object BEFORE the persistence block at line 143-163. The persist code is unreachable dead code.
**Impact**: No persistent behavior profile. AI decisions cannot reference historical behavior patterns.

### GAP-2: behavior_patterns table NEVER populated
**Root Cause**: No service writes to this table. `behavior.model.service.js` does not create BehaviorPattern records.
**Impact**: No behavioral correlation tracking.

### GAP-3: adaptive.behavior.service.js is memory-only
**Root Cause**: Uses `Map()` for behavior store. No DB read/write. Data lost on restart.
**Impact**: Suggestion rate adaptation resets every deployment.

### GAP-4: planning.engine.service.js has no DB persistence
**Root Cause**: Only uses in-memory cache (10 min TTL). Unlike dayplanner.service which writes to day_plans.
**Impact**: Plans vanish quickly. No tracking of plan adherence.

### GAP-5: No execution loop engine
**Root Cause**: No service implements Observe->Decide->Act->Track->Learn loop. The orchestrator does a single-request pipeline. No periodic system that observes user state and proactively acts.
**Impact**: System is reactive only (responds to user messages). No autonomous daily lifecycle.

### GAP-6: Time intelligence is fragmented
- `energy.service.js` computes peak hours
- `planning.engine.service.js` has `predictEnergyCurve()`
- `scheduling.engine.service.js` uses ML context for focus hours
- `context.snapshot.service.js` does simple time-of-day energy estimate
- These don't feed into each other consistently.

### GAP-7: Goals not connected to planning
The `Goal` model exists, dashboard fetches active goals, but no planning engine uses goals to structure daily plans.

### GAP-8: No procrastination signal in behavior data
The command engine tracks reschedule_count per task, but this is not fed back into behavior_profiles or used to detect procrastination patterns.

### GAP-9: Assistant has no fallback for DB errors
The command endpoint catches errors but returns a generic Arabic error message. No retry logic for individual operations.

---

## 5. Conflicts / Redundancies

### CONFLICT-1: Three planning services
- `planning.engine.service.js` - in-memory, no DB
- `dayplanner.service.js` - full featured, DB persistence
- `scheduling.engine.service.js` - ML-enhanced, no DB
These overlap significantly. The orchestrator uses planning.engine but ai.core.plan() uses dayplanner.

### CONFLICT-2: Duplicate energy curves
- `energy.service.js` computes from historical data -> EnergyProfile table
- `planning.engine.service.js` has `predictEnergyCurve()` (circadian-based)
- `scheduling.engine.service.js` builds energy curve inline
- `context.snapshot.service.js` has simple fatigue model

### CONFLICT-3: behavior tracking split
- `adaptive.behavior.service.js` tracks suggestion acceptance (in-memory)
- `learning.engine.service.js` tracks decisions and outcomes (in-memory + DB)
- `behavior.model.service.js` builds behavior model (from DB data, but doesn't persist)
These should be unified into one behavior data source.

---

## 6. Reusable Components

| Component | Current State | Reusability |
|-----------|---------------|-------------|
| learning.engine.service.js | Working, DB-backed | HIGH - use as primary data source for all ML decisions |
| energy.service.js | Working, DB-backed | HIGH - foundational for time intelligence |
| context.snapshot.service.js | Working, in-memory | HIGH - real-time state for all services |
| dayplanner.service.js | Working, DB-backed | HIGH - promote as THE planner |
| decision.engine.service.js | Working, well-structured | HIGH - central decision maker |
| behavior.model.service.js | Has logic, persist broken | MEDIUM - fix persist, great data builder |
| scheduling.engine.service.js | Working, no persist | MEDIUM - useful ML slot assignment |

---

## 7. Implementation Priority (Steps 1-7)

1. **Step 1**: Fix behavior.model.service.js dead code. Make behavior_profiles actually populate. Wire behavior updates into task completion and habit logging hooks.
2. **Step 2**: Create execution.engine.service.js loop that runs periodically and drives the Observe->Decide->Act->Track->Learn cycle.
3. **Step 3**: Unify time intelligence by making energy.service the single source, feeding into planning and scheduling.
4. **Step 4**: Consolidate planning on dayplanner.service.js (DB-backed). Make planning.engine delegate to it.
5. **Step 5**: Add structured error handling with retries in assistant route.
6. **Step 6**: Wire everything: Behavior -> Planning -> Time -> Execution -> Assistant.
7. **Step 7**: Add validation logging and test scenarios.
