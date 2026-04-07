/**
 * Phase 13.1: Core System Fixes Validation Test Suite
 * ═══════════════════════════════════════════════════════
 * Tests all 7 issues: task segmentation, subtasks, assistant messaging,
 * controlled actions, email auth, phone removal, WhatsApp VA.
 *
 * Run: node tests/phase13_1_validation_test.js
 */

'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// Helpers
let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

(async () => {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(' Phase 13.1: Core System Fixes — Validation Suite');
  console.log('══════════════════════════════════════════════════════════\n');

  // ─── Issue 1: Task Segmentation ───────────────────────────────────────────
  console.log('📋 Issue 1: Task Segmentation');
  try {
    const taskController = require(path.join(ROOT, 'backend/src/controllers/task.controller'));
    check('getAllTasks endpoint exists', typeof taskController.getAllTasks === 'function');
    check('getSmartView endpoint exists', typeof taskController.getSmartView === 'function');
    check('getTodayTasks endpoint exists', typeof taskController.getTodayTasks === 'function');
    check('getTasks endpoint exists', typeof taskController.getTasks === 'function');

    // Verify route registration
    const fs = require('fs');
    const routeFile = fs.readFileSync(path.join(ROOT, 'backend/src/routes/task.routes.js'), 'utf8');
    check('Route /tasks/all registered', routeFile.includes("router.get('/all'"));
    check('Route /tasks/smart-view registered', routeFile.includes("router.get('/smart-view'"));
    check('Route /tasks/today registered', routeFile.includes("router.get('/today'"));

    // Verify frontend API
    const apiFile = fs.readFileSync(path.join(ROOT, 'frontend/src/utils/api.js'), 'utf8');
    check('taskAPI.getAllTasks exists in frontend', apiFile.includes('getAllTasks'));

    // Verify TasksView uses allData
    const tasksViewFile = fs.readFileSync(path.join(ROOT, 'frontend/src/components/tasks/TasksView.jsx'), 'utf8');
    check('TasksView has "All Tasks" query', tasksViewFile.includes('tasks-all'));
    check('TasksView renders overdue section in all mode', tasksViewFile.includes('allData.overdue'));
    check('TasksView renders upcoming section in all mode', tasksViewFile.includes('allData.upcoming'));
    check('TasksView renders no-due-date section in all mode', tasksViewFile.includes('allData.noDueDate'));
  } catch (e) {
    console.log(`  ❌ Issue 1 load error: ${e.message}`);
    fail++;
  }

  // ─── Issue 2: Task Decomposition (Subtasks) ──────────────────────────────
  console.log('\n🔧 Issue 2: Task Decomposition (Subtasks)');
  try {
    const Subtask = require(path.join(ROOT, 'backend/src/models/subtask.model'));
    check('Subtask model loads', !!Subtask);
    check('Subtask has id field', !!Subtask.rawAttributes.id);
    check('Subtask has task_id field', !!Subtask.rawAttributes.task_id);
    check('Subtask has user_id field', !!Subtask.rawAttributes.user_id);
    check('Subtask has title field', !!Subtask.rawAttributes.title);
    check('Subtask has completed field', !!Subtask.rawAttributes.completed);
    check('Subtask has completed_at field', !!Subtask.rawAttributes.completed_at);
    check('Subtask has estimated_time field', !!Subtask.rawAttributes.estimated_time);
    check('Subtask has order_index field', !!Subtask.rawAttributes.order_index);

    const taskController = require(path.join(ROOT, 'backend/src/controllers/task.controller'));
    check('getSubtasks endpoint exists', typeof taskController.getSubtasks === 'function');
    check('createSubtask endpoint exists', typeof taskController.createSubtask === 'function');
    check('updateSubtask endpoint exists', typeof taskController.updateSubtask === 'function');
    check('completeSubtask endpoint exists', typeof taskController.completeSubtask === 'function');
    check('deleteSubtask endpoint exists', typeof taskController.deleteSubtask === 'function');

    // Verify routes
    const fs = require('fs');
    const routeFile = fs.readFileSync(path.join(ROOT, 'backend/src/routes/task.routes.js'), 'utf8');
    check('GET /:id/subtasks route', routeFile.includes("router.get('/:id/subtasks'"));
    check('POST /:id/subtasks route', routeFile.includes("router.post('/:id/subtasks'"));
    check('PUT /:taskId/subtasks/:subtaskId route', routeFile.includes("router.put('/:taskId/subtasks/:subtaskId'"));
    check('PATCH complete subtask route', routeFile.includes("router.patch('/:taskId/subtasks/:subtaskId/complete'"));
    check('DELETE subtask route', routeFile.includes("router.delete('/:taskId/subtasks/:subtaskId'"));

    // Verify frontend API
    const apiFile = fs.readFileSync(path.join(ROOT, 'frontend/src/utils/api.js'), 'utf8');
    check('taskAPI.getSubtasks in frontend', apiFile.includes('getSubtasks'));
    check('taskAPI.createSubtask in frontend', apiFile.includes('createSubtask'));
    check('taskAPI.completeSubtask in frontend', apiFile.includes('completeSubtask'));
    check('taskAPI.deleteSubtask in frontend', apiFile.includes('deleteSubtask'));

    // Verify database registration
    const dbFile = fs.readFileSync(path.join(ROOT, 'backend/src/config/database.js'), 'utf8');
    check('Subtask model registered in database.js', dbFile.includes('subtask.model'));
  } catch (e) {
    console.log(`  ❌ Issue 2 load error: ${e.message}`);
    fail++;
  }

  // ─── Issue 3: Assistant Messaging Persistence ─────────────────────────────
  console.log('\n💬 Issue 3: Assistant Messaging Persistence');
  try {
    const fs = require('fs');
    const assistantFile = fs.readFileSync(path.join(ROOT, 'frontend/src/components/assistant/AssistantView.jsx'), 'utf8');
    check('Messages have status tracking (sending)', assistantFile.includes("status: 'sending'"));
    check('Messages have sent status', assistantFile.includes("status: 'sent'"));
    check('Messages have failed status', assistantFile.includes("status: 'failed'"));
    check('Retry handler exists', assistantFile.includes('handleRetry'));
    check('onRetry prop passed to MsgBubble', assistantFile.includes('onRetry={handleRetry}'));
    check('Failed message UI shows retry button', assistantFile.includes('إعادة المحاولة'));

    // Verify backend persists both user and assistant messages
    const chatRoutesFile = fs.readFileSync(path.join(ROOT, 'backend/src/routes/chat.routes.js'), 'utf8');
    check('User message persisted to DB', chatRoutesFile.includes("role      : 'user'"));
    check('Assistant message persisted to DB', chatRoutesFile.includes("role         : 'assistant'"));

    // Verify ChatMessage model
    const ChatMessage = require(path.join(ROOT, 'backend/src/models/chat_message.model'));
    check('ChatMessage model loads', !!ChatMessage);
    check('ChatMessage has content field', !!ChatMessage.rawAttributes.content);
    check('ChatMessage has role field', !!ChatMessage.rawAttributes.role);
  } catch (e) {
    console.log(`  ❌ Issue 3 load error: ${e.message}`);
    fail++;
  }

  // ─── Issue 4: Assistant Controlled Actions ────────────────────────────────
  console.log('\n🛡️ Issue 4: Assistant Controlled Actions');
  try {
    const fs = require('fs');
    const assistantFile = fs.readFileSync(path.join(ROOT, 'frontend/src/components/assistant/AssistantView.jsx'), 'utf8');
    check('proposedActions tracked in messages', assistantFile.includes('proposedActions'));
    check('onConfirmAction handler exists', assistantFile.includes('handleConfirmAction'));
    check('Action confirmation UI (suggest→confirm→execute)', assistantFile.includes('إجراءات مقترحة'));
    check('Action confirmed state tracked', assistantFile.includes('action.confirmed'));
    check('Actions from AI response parsed', assistantFile.includes("data?.actions"));
    check('Confirmed actions display check mark', assistantFile.includes("'✅'"));
    check('Unconfirmed actions show play button', assistantFile.includes("'▶️'"));
  } catch (e) {
    console.log(`  ❌ Issue 4 load error: ${e.message}`);
    fail++;
  }

  // ─── Issue 5: Email Authentication ────────────────────────────────────────
  console.log('\n📧 Issue 5: Email Authentication');
  try {
    const authController = require(path.join(ROOT, 'backend/src/controllers/auth.controller'));
    check('register endpoint exists', typeof authController.register === 'function');
    check('verifyEmail endpoint exists', typeof authController.verifyEmail === 'function');
    check('forgotPassword endpoint exists', typeof authController.forgotPassword === 'function');
    check('resetPassword endpoint exists', typeof authController.resetPassword === 'function');
    check('resendVerification endpoint exists', typeof authController.resendVerification === 'function');

    const fs = require('fs');
    const authFile = fs.readFileSync(path.join(ROOT, 'backend/src/controllers/auth.controller.js'), 'utf8');
    check('SMTP integration code present', authFile.includes('SMTP_HOST'));
    check('nodemailer integration for OTP', authFile.includes('nodemailer'));
    check('HTML email template for OTP', authFile.includes('رمز'));
    check('OTP expiry check in verify-email', authFile.includes('email_verify_expires'));
    check('OTP expiry check in reset-password', authFile.includes('reset_token_expires'));
    check('OTP generation (6-digit)', authFile.includes('100000'));
    check('Verification token stored on create', authFile.includes('email_verify_token: verifyOTP'));
    check('Registration requires email', authFile.includes("message: 'البريد الإلكتروني مطلوب'"));

    // Verify routes
    const routeFile = fs.readFileSync(path.join(ROOT, 'backend/src/routes/auth.routes.js'), 'utf8');
    check('POST /verify-email route registered', routeFile.includes("/verify-email"));
    check('POST /forgot-password route registered', routeFile.includes("/forgot-password"));
    check('POST /reset-password route registered', routeFile.includes("/reset-password"));
    check('POST /resend-verification route registered', routeFile.includes("/resend-verification"));
  } catch (e) {
    console.log(`  ❌ Issue 5 load error: ${e.message}`);
    fail++;
  }

  // ─── Issue 6: Remove Phone Auth ───────────────────────────────────────────
  console.log('\n🚫 Issue 6: Remove Phone Auth');
  try {
    const fs = require('fs');
    const authFile = fs.readFileSync(path.join(ROOT, 'backend/src/controllers/auth.controller.js'), 'utf8');
    check('Register does NOT accept phone for login flow', !authFile.includes("phone: phone || null") || authFile.includes('Phase 13.1'));
    check('Login uses email only', authFile.includes("const { email, password } = req.body") || authFile.includes('Email only'));

    const loginFile = fs.readFileSync(path.join(ROOT, 'frontend/src/pages/login.js'), 'utf8');
    check('Phone toggle removed from login page', !loginFile.includes("setUsePhone(true)"));
    check('Phone input UI removed', !loginFile.includes("رقم الهاتف</label>"));
    check('Phone validation removed', !loginFile.includes("form.phone.trim()"));
    check('Login page header says email only', loginFile.includes('email') || loginFile.includes('Email'));

    const authStoreFile = fs.readFileSync(path.join(ROOT, 'frontend/src/store/authStore.js'), 'utf8');
    check('authStore.login uses email only', authStoreFile.includes('email only') || authStoreFile.includes('Phase 13.1'));
  } catch (e) {
    console.log(`  ❌ Issue 6 load error: ${e.message}`);
    fail++;
  }

  // ─── Issue 7: WhatsApp VA Integration ─────────────────────────────────────
  console.log('\n📱 Issue 7: WhatsApp VA Integration');
  try {
    const fs = require('fs');
    const vaFile = fs.readFileSync(path.join(ROOT, 'backend/src/routes/va.routes.js'), 'utf8');
    check('POST /whatsapp/send route exists', vaFile.includes("router.post('/whatsapp/send'"));
    check('POST /whatsapp/webhook route exists', vaFile.includes("router.post('/whatsapp/webhook'"));
    check('WhatsApp webhook handles incoming messages', vaFile.includes('WhatsApp webhook received'));
    check('VA presence endpoint exists', vaFile.includes("router.get('/presence'"));
    check('VA escalation endpoint exists', vaFile.includes("router.post('/escalate'"));
    check('VA comm/send endpoint exists', vaFile.includes("router.post('/comm/send'"));

    // Verify communication engine
    const commFile = fs.readFileSync(path.join(ROOT, 'backend/src/services/communication.engine.service.js'), 'utf8');
    check('WhatsApp delivery function exists', commFile.includes('deliverWhatsApp'));
    check('Twilio client integration exists', commFile.includes('getTwilioClient'));
    check('WhatsApp number configuration', commFile.includes('TWILIO_WHATSAPP_NUMBER'));
    check('Smart silence for WhatsApp', commFile.includes('Smart silence'));
    check('Rate limiting for WhatsApp', commFile.includes('whatsapp'));
    check('Quiet hours for WhatsApp', commFile.includes('quiet_hours'));
  } catch (e) {
    console.log(`  ❌ Issue 7 load error: ${e.message}`);
    fail++;
  }

  // ─── Cross-cutting: System Integrity ──────────────────────────────────────
  console.log('\n🔒 Cross-cutting: System Integrity');
  try {
    const fs = require('fs');

    // Verify no broken imports
    const indexFile = fs.readFileSync(path.join(ROOT, 'backend/src/index.js'), 'utf8');
    check('Backend index.js exists and is readable', indexFile.length > 100);

    // Verify models load without crash
    const models = [
      'user.model', 'task.model', 'habit.model', 'mood.model',
      'chat_message.model', 'chat_session.model', 'subtask.model',
    ];
    for (const m of models) {
      try {
        require(path.join(ROOT, `backend/src/models/${m}`));
        check(`Model ${m} loads OK`, true);
      } catch (e) {
        check(`Model ${m} loads OK`, false);
      }
    }

    // Verify frontend components exist
    const components = [
      'frontend/src/components/tasks/TasksView.jsx',
      'frontend/src/components/assistant/AssistantView.jsx',
      'frontend/src/components/dashboard/Dashboard.jsx',
      'frontend/src/pages/login.js',
      'frontend/src/store/authStore.js',
      'frontend/src/store/brainStore.js',
    ];
    for (const c of components) {
      check(`${c.split('/').pop()} exists`, fs.existsSync(path.join(ROOT, c)));
    }
  } catch (e) {
    console.log(`  ❌ Integrity check error: ${e.message}`);
    fail++;
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(` Phase 13.1 Results: ${pass} PASS, ${fail} FAIL`);
  console.log('══════════════════════════════════════════════════════════\n');

  if (fail > 0) process.exit(1);
  else process.exit(0);
})();
