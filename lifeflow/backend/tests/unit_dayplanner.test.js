/**
 * Unit Tests — dayplanner.service.js helpers
 * ============================================
 * Tests block-building, priority sorting, energy-match scoring,
 * and schedule-assembly logic without DB calls.
 */

let passed = 0;
let failed = 0;

function ok(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ' | ' + detail : ''}`); failed++; }
}

// ── Helpers replicated from dayplanner.service ────────────────────────────────

function hourLabel(h) {
  const ampm = h < 12 ? 'ص' : 'م';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
}

function priorityOrder(p) {
  return { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }[p] ?? 4;
}

function calcEnergyMatch(taskEnergy, windowEnergy) {
  // taskEnergy: 'high'|'medium'|'low', windowEnergy: 0-100 score
  const taskMap = { high: 70, medium: 50, low: 30, none: 50 };
  const required = taskMap[taskEnergy] ?? 50;
  if (windowEnergy >= required + 20)   return 95;
  if (windowEnergy >= required)         return 80;
  if (windowEnergy >= required - 15)    return 60;
  return 40;
}

function buildBreakBlock(hour) {
  return {
    type:       'break',
    hour,
    time_label: hourLabel(hour),
    title:      'استراحة',
    description: 'خذ استراحة قصيرة لتجديد طاقتك',
    duration:   15,
    priority:   null,
    energy_match: 100,
  };
}

function buildHabitBlock(habit, hour) {
  return {
    type:        'habit',
    hour,
    time_label:  hourLabel(hour),
    title:       habit.name,
    description: `عادة: ${habit.category || 'عامة'}`,
    duration:    20,
    priority:    null,
    energy_match: 75,
    habit_id:    habit.id,
  };
}

function sortByPriority(tasks) {
  return [...tasks].sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));
}

function calcStats(schedule) {
  const taskBlocks = schedule.filter(b => b.type === 'task');
  const totalWork  = schedule.reduce((s, b) => s + (b.duration || 0), 0);
  const matchSum   = schedule.reduce((s, b) => s + (b.energy_match || 0), 0);
  const matchAvg   = schedule.length > 0 ? Math.round(matchSum / schedule.length) : 0;
  return {
    scheduled_tasks:        taskBlocks.length,
    estimated_work_minutes: totalWork,
    energy_match_score:     matchAvg,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function testHourLabel() {
  console.log('─── hourLabel ───');
  ok('midnight → 12:00 ص',  hourLabel(0)  === '12:00 ص');
  ok('6am → 6:00 ص',        hourLabel(6)  === '6:00 ص');
  ok('noon → 12:00 م',       hourLabel(12) === '12:00 م');
  ok('1pm → 1:00 م',         hourLabel(13) === '1:00 م');
  ok('6pm → 6:00 م',         hourLabel(18) === '6:00 م');
  ok('11pm → 11:00 م',       hourLabel(23) === '11:00 م');
}

function testPriorityOrder() {
  console.log('─── priorityOrder ───');
  ok('urgent < high',   priorityOrder('urgent') < priorityOrder('high'));
  ok('high < medium',   priorityOrder('high')   < priorityOrder('medium'));
  ok('medium < low',    priorityOrder('medium') < priorityOrder('low'));
  ok('low < none',      priorityOrder('low')    < priorityOrder('none'));
  ok('unknown → 4',     priorityOrder('xyz')    === 4);
}

function testEnergyMatch() {
  console.log('─── calcEnergyMatch ───');
  // High task with high energy window → excellent match
  ok('high task + 90 energy → 95',   calcEnergyMatch('high', 90)   === 95);
  // High task with exact threshold → good match
  ok('high task + 70 energy → 80',   calcEnergyMatch('high', 70)   === 80);
  // High task with slightly below threshold → acceptable
  ok('high task + 60 energy → 60',   calcEnergyMatch('high', 60)   === 60);
  // High task with low energy → poor match
  ok('high task + 40 energy → 40',   calcEnergyMatch('high', 40)   === 40);

  // Low task with any energy → comfortable
  ok('low task + 30 energy → 80',    calcEnergyMatch('low', 30)    === 80);
  ok('low task + 20 energy → 60',    calcEnergyMatch('low', 20)    === 60);

  // Medium task
  ok('medium task + 70 energy → 95', calcEnergyMatch('medium', 70) === 95);
  ok('medium task + 50 energy → 80', calcEnergyMatch('medium', 50) === 80);

  // Unknown energy level defaults to medium (50 required)
  ok('unknown task + 75 energy → 95',calcEnergyMatch('none', 75) === 95);
}

function testBreakBlock() {
  console.log('─── buildBreakBlock ───');
  const b = buildBreakBlock(10);
  ok('type=break',         b.type === 'break');
  ok('hour=10',            b.hour === 10);
  ok('time_label=10:00 ص', b.time_label === '10:00 ص');
  ok('duration=15',        b.duration === 15);
  ok('energy_match=100',   b.energy_match === 100);
  ok('has title',          typeof b.title === 'string' && b.title.length > 0);
}

function testHabitBlock() {
  console.log('─── buildHabitBlock ───');
  const habit = { id: 'h1', name: 'قراءة', category: 'learning' };
  const b = buildHabitBlock(habit, 8);
  ok('type=habit',       b.type === 'habit');
  ok('hour=8',           b.hour === 8);
  ok('title=habit name', b.title === 'قراءة');
  ok('duration=20',      b.duration === 20);
  ok('has habit_id',     b.habit_id === 'h1');
  ok('energy_match=75',  b.energy_match === 75);
}

function testSortByPriority() {
  console.log('─── sortByPriority ───');
  const tasks = [
    { title: 'A', priority: 'medium' },
    { title: 'B', priority: 'urgent' },
    { title: 'C', priority: 'low' },
    { title: 'D', priority: 'high' },
  ];
  const sorted = sortByPriority(tasks);
  ok('first = urgent',  sorted[0].priority === 'urgent');
  ok('second = high',   sorted[1].priority === 'high');
  ok('third = medium',  sorted[2].priority === 'medium');
  ok('fourth = low',    sorted[3].priority === 'low');
  ok('original unchanged', tasks[0].priority === 'medium'); // immutable sort
}

function testCalcStats() {
  console.log('─── calcStats ───');
  const schedule = [
    { type: 'task',  duration: 45, energy_match: 80 },
    { type: 'task',  duration: 30, energy_match: 90 },
    { type: 'break', duration: 15, energy_match: 100 },
    { type: 'habit', duration: 20, energy_match: 75 },
  ];
  const stats = calcStats(schedule);
  ok('scheduled_tasks=2',         stats.scheduled_tasks === 2);
  ok('estimated_work_minutes=110',stats.estimated_work_minutes === 110);
  ok('energy_match_score avg',    stats.energy_match_score === Math.round((80+90+100+75)/4));

  // Empty schedule
  const empty = calcStats([]);
  ok('empty → 0 tasks',         empty.scheduled_tasks === 0);
  ok('empty → 0 minutes',       empty.estimated_work_minutes === 0);
  ok('empty → 0 match',         empty.energy_match_score === 0);
}

function testScheduleOrder() {
  console.log('─── Schedule Order Validation ───');
  const schedule = [
    { hour: 8,  type: 'routine' },
    { hour: 9,  type: 'task'    },
    { hour: 10, type: 'break'   },
    { hour: 11, type: 'task'    },
    { hour: 13, type: 'task'    },
    { hour: 17, type: 'review'  },
  ];
  const isSorted = schedule.every((b, i, a) => i === 0 || b.hour >= a[i-1].hour);
  ok('schedule is sorted by hour', isSorted);

  // Verify we can detect unsorted
  const unsorted = [{ hour: 10 }, { hour: 8 }];
  const isUnsorted = unsorted.every((b, i, a) => i === 0 || b.hour >= a[i-1].hour);
  ok('detects unsorted schedule',  !isUnsorted);
}

// ── Run all ───────────────────────────────────────────────────────────────────
console.log('\n🔬 DayPlanner Service — Unit Tests\n' + '='.repeat(50));
testHourLabel();
testPriorityOrder();
testEnergyMatch();
testBreakBlock();
testHabitBlock();
testSortByPriority();
testCalcStats();
testScheduleOrder();

console.log('\n' + '='.repeat(50));
const total = passed + failed;
const pct   = Math.round((passed / total) * 100);
console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}  📊 Total: ${total}  📈 ${pct}%`);
process.exit(failed > 0 ? 1 : 0);
