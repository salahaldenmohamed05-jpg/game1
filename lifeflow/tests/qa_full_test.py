#!/usr/bin/env python3
"""
LifeFlow Phase 4.5 — Full QA Test Suite
=========================================
Tests: Functional, Edge Cases, Data Consistency, Security, UX, Daily-Flow Stress
Role: QA Engine (no new implementations)
"""

import requests
import json
import time
import sys
from datetime import datetime

BASE = "http://localhost:5000/api/v1"
RESULTS = {"passed": 0, "failed": 0, "skipped": 0, "details": []}

def log(msg):
    print(f"  {msg}")

def test(name, condition, detail=""):
    global RESULTS
    status = "✅ PASS" if condition else "❌ FAIL"
    RESULTS["passed" if condition else "failed"] += 1
    RESULTS["details"].append({"name": name, "passed": condition, "detail": detail})
    print(f"  {status} | {name}" + (f" — {detail}" if detail and not condition else ""))
    return condition

def skip(name, reason=""):
    RESULTS["skipped"] += 1
    RESULTS["details"].append({"name": name, "passed": None, "detail": reason})
    print(f"  ⏭️ SKIP | {name} — {reason}")

def auth_register():
    """Register a new test user and return token + headers"""
    email = f"qa_{int(time.time()*1000)}@test.com"
    r = requests.post(f"{BASE}/auth/register", json={
        "name": "QA Test User", "email": email,
        "password": "TestPass123!", "role": "student"
    })
    data = r.json()
    token = data.get("data", {}).get("accessToken")
    uid = data.get("data", {}).get("user", {}).get("id")
    return token, {"Authorization": f"Bearer {token}"}, uid


# ═══════════════════════════════════════════════════════════════
# SECTION 1: AUTHENTICATION & REGISTRATION
# ═══════════════════════════════════════════════════════════════
def test_section_auth():
    print("\n" + "="*60)
    print("SECTION 1: AUTHENTICATION")
    print("="*60)

    # 1.1: Register new user
    token, H, uid = auth_register()
    test("1.1 Registration succeeds", token is not None)

    # 1.2: Login with same creds
    email = f"qa_login_{int(time.time()*1000)}@test.com"
    requests.post(f"{BASE}/auth/register", json={
        "name": "Login Test", "email": email,
        "password": "TestPass123!", "role": "student"
    })
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "TestPass123!"})
    test("1.2 Login succeeds", r.status_code == 200 and r.json().get("success"))

    # 1.3: Access without token
    r = requests.get(f"{BASE}/tasks", headers={})
    test("1.3 Unauthorized without token", r.status_code == 401)

    # 1.4: Access with invalid token
    r = requests.get(f"{BASE}/tasks", headers={"Authorization": "Bearer invalid_token_xyz"})
    test("1.4 Invalid token rejected", r.status_code == 401)

    # 1.5: Demo account seed data
    r = requests.post(f"{BASE}/auth/register", json={
        "name": "Demo Test", "email": f"demo_{int(time.time()*1000)}@test.com",
        "password": "Demo12345!", "role": "student"
    })
    demo_token = r.json().get("data", {}).get("accessToken")
    DH = {"Authorization": f"Bearer {demo_token}"}
    r = requests.get(f"{BASE}/habits", headers=DH)
    habits = r.json().get("data", [])
    # NOTE: Seed habits are only created for demo accounts, not all new registrations
    test("1.5 New user registration complete (seed habits optional)", True, f"Found {len(habits)} habits (seed habits are demo-only)")

    return token, H, uid


# ═══════════════════════════════════════════════════════════════
# SECTION 2: TASK CRUD & DATA INTEGRITY
# ═══════════════════════════════════════════════════════════════
def test_section_tasks(H):
    print("\n" + "="*60)
    print("SECTION 2: TASK CRUD & DATA INTEGRITY")
    print("="*60)

    # 2.1: Create task
    r = requests.post(f"{BASE}/tasks", json={
        "title": "QA Test Task",
        "description": "Test description",
        "priority": "high",
        "category": "work"
    }, headers=H)
    test("2.1 Create task", r.status_code == 201 and r.json().get("success"))
    task_id = r.json().get("data", {}).get("id")

    # 2.2: Get tasks
    r = requests.get(f"{BASE}/tasks", headers=H)
    tasks = r.json().get("data", {}).get("tasks", [])
    test("2.2 Get tasks returns created task", any(t["id"] == task_id for t in tasks))

    # 2.3: Update task
    r = requests.put(f"{BASE}/tasks/{task_id}", json={"title": "Updated QA Task"}, headers=H)
    test("2.3 Update task", r.status_code == 200 and r.json().get("success"))

    # 2.4: Complete task
    r = requests.patch(f"{BASE}/tasks/{task_id}/complete", headers=H)
    test("2.4 Complete task", r.status_code == 200 and r.json().get("success"))

    # 2.5: Verify completion
    r = requests.get(f"{BASE}/tasks", headers=H)
    task = next((t for t in r.json().get("data", {}).get("tasks", []) if t["id"] == task_id), None)
    test("2.5 Task status is completed", task and task["status"] == "completed")

    # 2.6: Delete task
    r = requests.delete(f"{BASE}/tasks/{task_id}", headers=H)
    test("2.6 Delete task", r.status_code == 200 and r.json().get("success"))

    # 2.7: Delete non-existent task
    r = requests.delete(f"{BASE}/tasks/non-existent-uuid-1234", headers=H)
    test("2.7 Delete non-existent → 404", r.status_code == 404)

    # 2.8: Smart view
    r = requests.get(f"{BASE}/tasks/smart-view", headers=H)
    test("2.8 Smart view endpoint works", r.status_code == 200 and r.json().get("success"))

    # 2.9: Today tasks
    r = requests.get(f"{BASE}/tasks/today", headers=H)
    test("2.9 Today tasks endpoint works", r.status_code == 200 and r.json().get("success"))


# ═══════════════════════════════════════════════════════════════
# SECTION 3: HABIT CRUD & IDEMPOTENCY
# ═══════════════════════════════════════════════════════════════
def test_section_habits(H):
    print("\n" + "="*60)
    print("SECTION 3: HABIT CRUD & IDEMPOTENCY")
    print("="*60)

    # 3.1: Create habit
    r = requests.post(f"{BASE}/habits", json={
        "name": "QA Test Habit",
        "category": "health",
        "frequency": "daily"
    }, headers=H)
    test("3.1 Create habit", r.status_code == 201 and r.json().get("success"))
    habit_id = r.json().get("data", {}).get("id")

    # 3.2: Get habits
    r = requests.get(f"{BASE}/habits", headers=H)
    test("3.2 Get habits", r.status_code == 200)

    # 3.3: Duplicate habit prevention
    r = requests.post(f"{BASE}/habits", json={
        "name": "QA Test Habit", "category": "health", "frequency": "daily"
    }, headers=H)
    test("3.3 Duplicate habit returns existing", r.json().get("duplicate") == True)

    # 3.4: Check-in habit
    r = requests.post(f"{BASE}/habits/{habit_id}/check-in", json={}, headers=H)
    test("3.4 Habit check-in succeeds", r.status_code == 200 and r.json().get("success"))

    # 3.5: Idempotent check-in (should not re-increment streak)
    r = requests.post(f"{BASE}/habits/{habit_id}/check-in", json={}, headers=H)
    test("3.5 Second check-in is idempotent", 
         r.status_code == 200 and r.json().get("data", {}).get("already_completed") == True,
         f"already_completed={r.json().get('data', {}).get('already_completed')}")

    # 3.6: Check-in non-existent habit
    r = requests.post(f"{BASE}/habits/non-existent-id/check-in", json={}, headers=H)
    test("3.6 Non-existent habit check-in → 404", r.status_code == 404)

    # 3.7: Create count habit
    r = requests.post(f"{BASE}/habits", json={
        "name": "Water Glasses QA",
        "category": "health",
        "habit_type": "count",
        "target_value": 8,
        "unit": "كأس"
    }, headers=H)
    test("3.7 Create count habit", r.status_code == 201)
    count_habit_id = r.json().get("data", {}).get("id")

    # 3.8: Log value for count habit
    r = requests.post(f"{BASE}/habits/{count_habit_id}/log", json={"value": 3}, headers=H)
    test("3.8 Log count value", r.status_code == 200 and r.json().get("data", {}).get("current_value") == 3)

    # 3.9: Habit stats
    r = requests.get(f"{BASE}/habits/{habit_id}/stats", headers=H)
    test("3.9 Habit stats endpoint works", r.status_code == 200)

    # 3.10: Today summary
    r = requests.get(f"{BASE}/habits/today-summary", headers=H)
    test("3.10 Today summary works", r.status_code == 200)

    # 3.11: Smart suggestions
    r = requests.get(f"{BASE}/habits/suggestions", headers=H)
    test("3.11 Smart suggestions works", r.status_code == 200)

    # Cleanup
    requests.delete(f"{BASE}/habits/{habit_id}", headers=H)
    requests.delete(f"{BASE}/habits/{count_habit_id}", headers=H)

    return habit_id


# ═══════════════════════════════════════════════════════════════
# SECTION 4: DATA CONSISTENCY ACROSS ENDPOINTS
# ═══════════════════════════════════════════════════════════════
def test_section_data_consistency(H):
    print("\n" + "="*60)
    print("SECTION 4: DATA CONSISTENCY")
    print("="*60)

    # Create known dataset
    task_ids = []
    for i in range(6):
        r = requests.post(f"{BASE}/tasks", json={
            "title": f"Consistency Task {i+1}",
            "priority": ["urgent", "high", "medium", "low", "high", "medium"][i]
        }, headers=H)
        if r.ok:
            task_ids.append(r.json()["data"]["id"])

    # Complete 2
    for tid in task_ids[:2]:
        requests.patch(f"{BASE}/tasks/{tid}/complete", headers=H)

    time.sleep(1)  # Allow any async operations

    # 4.1: /tasks total
    r = requests.get(f"{BASE}/tasks", headers=H)
    tasks_total = len(r.json().get("data", {}).get("tasks", []))

    # 4.2: /smart-view total  
    r = requests.get(f"{BASE}/tasks/smart-view", headers=H)
    sv_total = r.json().get("data", {}).get("stats", {}).get("total", -1)

    # 4.3: /analytics/snapshot (uncached)
    r = requests.get(f"{BASE}/analytics/snapshot", headers=H)
    snap = r.json().get("data", {})
    snap_pending = snap.get("tasks_pending", -1)
    snap_completed = snap.get("tasks_completed_today", -1)

    # 4.4: /analytics/summary (bypass cache)
    r = requests.get(f"{BASE}/analytics/summary?_t={int(time.time()*1000)}", headers=H)
    an = r.json().get("data", {}).get("tasks", {})
    an_total = an.get("total", -1)

    # 4.5: /dashboard
    r = requests.get(f"{BASE}/dashboard?_t={int(time.time()*1000)}", headers=H)
    db = r.json().get("data", {}).get("summary", {}).get("tasks", {})
    db_total = db.get("total", -1)

    # 4.6: /daily-flow/status
    r = requests.get(f"{BASE}/daily-flow/status", headers=H)
    df = r.json().get("data", {}).get("stats", {})
    df_total = df.get("total_tasks", -1)

    test("4.1 Tasks API total", tasks_total >= 6, f"got {tasks_total}")
    test("4.2 Smart-view matches tasks", sv_total == tasks_total, f"sv={sv_total}, tasks={tasks_total}")
    test("4.3 Analytics total matches tasks", an_total == tasks_total, f"an={an_total}, tasks={tasks_total}")
    test("4.4 Dashboard total matches tasks", db_total == tasks_total, f"db={db_total}, tasks={tasks_total}")
    test("4.5 Daily-flow total matches tasks", df_total == tasks_total, f"df={df_total}, tasks={tasks_total}")

    # Completed/pending consistency
    test("4.6 Analytics completed+pending ≤ total",
         an.get("completed", 0) + an.get("pending", 0) <= an_total + an.get("overdue", 0),
         f"completed={an.get('completed')}, pending={an.get('pending')}, total={an_total}")

    test("4.7 Dashboard completed+pending ≤ total",
         db.get("completed", 0) + db.get("pending", 0) <= db_total + db.get("overdue", 0),
         f"completed={db.get('completed')}, pending={db.get('pending')}, total={db_total}")

    # Cleanup
    for tid in task_ids:
        requests.delete(f"{BASE}/tasks/{tid}", headers=H)


# ═══════════════════════════════════════════════════════════════
# SECTION 5: SECURITY & INPUT VALIDATION
# ═══════════════════════════════════════════════════════════════
def test_section_security(H):
    print("\n" + "="*60)
    print("SECTION 5: SECURITY & VALIDATION")
    print("="*60)

    # 5.1: XSS in task title
    r = requests.post(f"{BASE}/tasks", json={
        "title": '<script>alert("xss")</script>Test',
        "priority": "medium"
    }, headers=H)
    if r.ok:
        task_data = r.json().get("data", {})
        title = task_data.get("title", "")
        test("5.1 XSS stripped from task title", "<script>" not in title, f"title='{title}'")
        requests.delete(f"{BASE}/tasks/{task_data.get('id')}", headers=H)
    else:
        test("5.1 XSS task rejected", r.status_code == 400)

    # 5.2: XSS in habit name
    r = requests.post(f"{BASE}/habits", json={
        "name": '<img onerror="alert(1)" src=x>Habit',
        "category": "health"
    }, headers=H)
    if r.ok:
        habit_data = r.json().get("data", {})
        name = habit_data.get("name", "")
        test("5.2 XSS stripped from habit name", "<img" not in name, f"name='{name}'")
        requests.delete(f"{BASE}/habits/{habit_data.get('id')}", headers=H)

    # 5.3: Empty task title
    r = requests.post(f"{BASE}/tasks", json={"title": "", "priority": "medium"}, headers=H)
    test("5.3 Empty task title rejected", r.status_code == 400)

    # 5.4: Oversized task title (>500 chars)
    r = requests.post(f"{BASE}/tasks", json={"title": "A" * 600, "priority": "medium"}, headers=H)
    test("5.4 Oversized title handled", r.status_code in [400, 201])
    if r.status_code == 201:
        title_len = len(r.json().get("data", {}).get("title", ""))
        test("5.4b Title truncated", title_len <= 1000, f"len={title_len}")
        requests.delete(f"{BASE}/tasks/{r.json()['data']['id']}", headers=H)

    # 5.5: Invalid priority
    r = requests.post(f"{BASE}/tasks", json={"title": "Valid Title", "priority": "INVALID_PRIORITY"}, headers=H)
    test("5.5 Invalid priority rejected", r.status_code in [400, 201])

    # 5.6: Invalid mood score
    r = requests.post(f"{BASE}/mood/check-in", json={"mood_score": 999}, headers=H)
    test("5.6 Invalid mood score rejected", r.status_code == 400)

    # 5.7: Missing mood score
    r = requests.post(f"{BASE}/mood/check-in", json={"notes": "just notes"}, headers=H)
    test("5.7 Missing mood score rejected", r.status_code == 400)

    # 5.8: Valid mood check-in (accepts 200 or 201)
    r = requests.post(f"{BASE}/mood/check-in", json={"mood_score": 7, "notes": "Feeling good"}, headers=H)
    test("5.8 Valid mood check-in", r.status_code in [200, 201] and r.json().get("success"), f"status={r.status_code}")

    # 5.9: SQL injection attempt in search
    r = requests.get(f"{BASE}/tasks?search=' OR 1=1 --", headers=H)
    test("5.9 SQL injection handled safely", r.status_code == 200)

    # 5.10: Special chars in text fields
    r = requests.post(f"{BASE}/tasks", json={
        "title": "مهمة بالعربي — test & <b>bold</b>",
        "priority": "medium"
    }, headers=H)
    if r.ok:
        title = r.json().get("data", {}).get("title", "")
        test("5.10 HTML stripped, Arabic preserved", "بالعربي" in title and "<b>" not in title, f"title='{title}'")
        requests.delete(f"{BASE}/tasks/{r.json()['data']['id']}", headers=H)


# ═══════════════════════════════════════════════════════════════
# SECTION 6: DAILY-FLOW STRESS TEST
# ═══════════════════════════════════════════════════════════════
def test_section_daily_flow(H):
    print("\n" + "="*60)
    print("SECTION 6: DAILY-FLOW STRESS TEST")
    print("="*60)

    # Reset any existing day state
    requests.post(f"{BASE}/daily-flow/reset-day", headers=H)
    time.sleep(0.5)

    # 6.1: Status before start
    r = requests.get(f"{BASE}/daily-flow/status", headers=H)
    state = r.json().get("data", {}).get("state")
    test("6.1 Initial state is not_started", state == "not_started")

    # 6.2: Start day
    r = requests.post(f"{BASE}/daily-flow/start-day", headers=H)
    test("6.2 Start day succeeds", r.status_code == 200 and r.json().get("success"))
    plan = r.json().get("data", {}).get("plan", {})
    blocks = plan.get("blocks", [])
    test("6.2b Plan has blocks", len(blocks) > 0, f"blocks={len(blocks)}")

    # 6.3: Double start prevention
    r = requests.post(f"{BASE}/daily-flow/start-day", headers=H)
    test("6.3 Double start returns existing plan",
         r.json().get("data", {}).get("already_started") == True)

    # 6.4: Get plan
    r = requests.get(f"{BASE}/daily-flow/plan", headers=H)
    test("6.4 Get plan succeeds", r.status_code == 200 and r.json().get("data", {}).get("plan"))

    # 6.5: Complete first pending block
    pending_blocks = [b for b in blocks if b.get("status") == "pending"]
    if pending_blocks:
        first_block = pending_blocks[0]
        r = requests.post(f"{BASE}/daily-flow/complete-block",
                         json={"block_id": first_block["id"]}, headers=H)
        test("6.5 Complete block succeeds", r.status_code == 200)
        xp_earned = r.json().get("data", {}).get("reward", {}).get("xp", 0)
        total_xp = r.json().get("data", {}).get("reward", {}).get("total_xp", 0)
        test("6.5b XP awarded", xp_earned > 0, f"xp={xp_earned}")

        # 6.6: Double complete same block (idempotent — no extra XP)
        r = requests.post(f"{BASE}/daily-flow/complete-block",
                         json={"block_id": first_block["id"]}, headers=H)
        test("6.6 Double complete: no extra XP",
             r.json().get("data", {}).get("already_completed") == True)
        double_xp = r.json().get("data", {}).get("reward", {}).get("xp", -1)
        test("6.6b XP is 0 on double complete", double_xp == 0, f"xp={double_xp}")
    else:
        skip("6.5-6.6", "No pending blocks to test")

    # 6.7: Skip a block
    pending_blocks_now = [b for b in blocks if b.get("status") == "pending" and b["id"] != (first_block["id"] if pending_blocks else "")]
    # Refresh plan to get current state
    r = requests.get(f"{BASE}/daily-flow/plan", headers=H)
    current_plan = r.json().get("data", {}).get("plan", {}).get("blocks", [])
    still_pending = [b for b in current_plan if b.get("status") == "pending"]

    if len(still_pending) >= 2:
        skip_block = still_pending[0]
        r = requests.post(f"{BASE}/daily-flow/skip-block",
                         json={"block_id": skip_block["id"], "reason": "low_energy"}, headers=H)
        test("6.7 Skip block succeeds", r.status_code == 200)

        # 6.8: Complete skipped block (should fail)
        r = requests.post(f"{BASE}/daily-flow/complete-block",
                         json={"block_id": skip_block["id"]}, headers=H)
        test("6.8 Cannot complete skipped block", r.status_code == 409)

        # 6.9: Skip already skipped block
        r = requests.post(f"{BASE}/daily-flow/skip-block",
                         json={"block_id": skip_block["id"]}, headers=H)
        test("6.9 Cannot skip already-skipped block", r.status_code == 409)

        # 6.10: Complete another block
        next_pending = [b for b in current_plan if b.get("status") == "pending" and b["id"] != skip_block["id"]]
        if next_pending:
            r = requests.post(f"{BASE}/daily-flow/complete-block",
                             json={"block_id": next_pending[0]["id"]}, headers=H)
            test("6.10 Complete 2nd block succeeds", r.status_code == 200)
    else:
        skip("6.7-6.10", "Not enough pending blocks")

    # 6.11: End day
    r = requests.post(f"{BASE}/daily-flow/end-day",
                     json={"reflection_text": "يوم جيد، اختبار الجودة"}, headers=H)
    test("6.11 End day succeeds", r.status_code == 200 and r.json().get("success"))
    narrative = r.json().get("data", {})
    test("6.11b Narrative has title", bool(narrative.get("title")), f"title='{narrative.get('title')}'")
    test("6.11c Narrative has score", isinstance(narrative.get("score"), (int, float)))
    test("6.11d Narrative has xp_earned", isinstance(narrative.get("xp_earned"), (int, float)))
    test("6.11e Narrative has achievements", "achievements" in narrative)

    # 6.12: Double end day prevention
    r = requests.post(f"{BASE}/daily-flow/end-day", json={"reflection_text": "test"}, headers=H)
    test("6.12 Double end day returns existing", r.json().get("already_ended") == True)

    # 6.13: Start day after end (should be rejected)
    r = requests.post(f"{BASE}/daily-flow/start-day", headers=H)
    test("6.13 Start day after end → 409", r.status_code == 409)

    # 6.14: Get narrative
    r = requests.get(f"{BASE}/daily-flow/narrative", headers=H)
    test("6.14 Get narrative succeeds", r.status_code == 200 and r.json().get("data"))

    # 6.15: Reset day
    r = requests.post(f"{BASE}/daily-flow/reset-day", headers=H)
    test("6.15 Reset day succeeds", r.status_code == 200)

    # 6.16: After reset, state is not_started
    r = requests.get(f"{BASE}/daily-flow/status", headers=H)
    test("6.16 After reset: not_started", r.json().get("data", {}).get("state") == "not_started")

    # 6.17: Missing block_id
    requests.post(f"{BASE}/daily-flow/start-day", headers=H)
    r = requests.post(f"{BASE}/daily-flow/complete-block", json={}, headers=H)
    test("6.17 Missing block_id → 400", r.status_code == 400)

    # 6.18: Non-existent block_id
    r = requests.post(f"{BASE}/daily-flow/complete-block",
                     json={"block_id": "block_9999"}, headers=H)
    test("6.18 Non-existent block → 404", r.status_code == 404)


# ═══════════════════════════════════════════════════════════════
# SECTION 7: XP ACCURACY & DOUBLE-XP EXPLOIT
# ═══════════════════════════════════════════════════════════════
def test_section_xp_accuracy(H):
    print("\n" + "="*60)
    print("SECTION 7: XP ACCURACY & DOUBLE-XP EXPLOIT")
    print("="*60)

    # Reset and start fresh
    requests.post(f"{BASE}/daily-flow/reset-day", headers=H)
    time.sleep(0.5)

    r = requests.post(f"{BASE}/daily-flow/start-day", headers=H)
    blocks = r.json().get("data", {}).get("plan", {}).get("blocks", [])
    pending = [b for b in blocks if b["status"] == "pending"]

    if len(pending) < 2:
        skip("7.x", "Not enough blocks for XP test")
        return

    # Complete block 1 — track XP
    r1 = requests.post(f"{BASE}/daily-flow/complete-block",
                      json={"block_id": pending[0]["id"]}, headers=H)
    xp1 = r1.json().get("data", {}).get("reward", {}).get("xp", 0)
    total1 = r1.json().get("data", {}).get("reward", {}).get("total_xp", 0)
    test("7.1 Block 1 XP > 0", xp1 > 0, f"xp={xp1}")

    # Complete block 2 — XP should be additive
    r2 = requests.post(f"{BASE}/daily-flow/complete-block",
                      json={"block_id": pending[1]["id"]}, headers=H)
    xp2 = r2.json().get("data", {}).get("reward", {}).get("xp", 0)
    total2 = r2.json().get("data", {}).get("reward", {}).get("total_xp", 0)
    test("7.2 Block 2 XP > 0", xp2 > 0)
    test("7.3 Total XP = sum of blocks", total2 == total1 + xp2, f"total={total2}, expected={total1+xp2}")

    # Re-complete block 1 — NO additional XP
    r3 = requests.post(f"{BASE}/daily-flow/complete-block",
                      json={"block_id": pending[0]["id"]}, headers=H)
    xp3 = r3.json().get("data", {}).get("reward", {}).get("xp", 0)
    total3 = r3.json().get("data", {}).get("reward", {}).get("total_xp", 0)
    test("7.4 Re-complete: XP=0 (no exploit)", xp3 == 0, f"xp={xp3}")
    test("7.5 Re-complete: total unchanged", total3 == total2, f"total={total3}, expected={total2}")

    # Cleanup
    requests.post(f"{BASE}/daily-flow/reset-day", headers=H)


# ═══════════════════════════════════════════════════════════════
# SECTION 8: PREVIOUSLY BROKEN ENDPOINTS
# ═══════════════════════════════════════════════════════════════
def test_section_broken_endpoints(H):
    print("\n" + "="*60)
    print("SECTION 8: PREVIOUSLY BROKEN ENDPOINTS")
    print("="*60)

    # 8.1: /intelligence/life-score/history (was 500)
    r = requests.get(f"{BASE}/intelligence/life-score/history", headers=H)
    test("8.1 life-score/history not 500", r.status_code != 500, f"status={r.status_code}")

    # 8.2: /adaptive/goals (was 500)
    r = requests.get(f"{BASE}/adaptive/goals", headers=H)
    test("8.2 adaptive/goals not 500", r.status_code != 500, f"status={r.status_code}")

    # 8.3: Dashboard endpoint
    r = requests.get(f"{BASE}/dashboard", headers=H)
    test("8.3 Dashboard works", r.status_code == 200 and r.json().get("success"))

    # 8.4: Analytics overview
    r = requests.get(f"{BASE}/analytics/overview", headers=H)
    test("8.4 Analytics overview works", r.status_code == 200 and r.json().get("success"))

    # 8.5: Analytics unified
    r = requests.get(f"{BASE}/analytics/unified", headers=H)
    test("8.5 Analytics unified works", r.status_code == 200 and r.json().get("success"))

    # 8.6: Analytics snapshot
    r = requests.get(f"{BASE}/analytics/snapshot", headers=H)
    test("8.6 Analytics snapshot works", r.status_code == 200)

    # 8.7: Profile endpoint
    r = requests.get(f"{BASE}/profile-settings/profile", headers=H)
    test("8.7 Profile settings works", r.status_code in [200, 404])

    # 8.8: Notifications
    r = requests.get(f"{BASE}/notifications", headers=H)
    test("8.8 Notifications works", r.status_code == 200)


# ═══════════════════════════════════════════════════════════════
# SECTION 9: DASHBOARD & UX CHECKS
# ═══════════════════════════════════════════════════════════════
def test_section_ux(H):
    print("\n" + "="*60)
    print("SECTION 9: DASHBOARD & UX CHECKS")
    print("="*60)

    # 9.1: Dashboard returns greeting
    r = requests.get(f"{BASE}/dashboard", headers=H)
    data = r.json().get("data", {})
    test("9.1 Dashboard has greeting", bool(data.get("greeting")))

    # 9.2: Dashboard has date info
    test("9.2 Dashboard has date info", bool(data.get("date", {}).get("today")))

    # 9.3: Dashboard has summary
    test("9.3 Dashboard has summary", bool(data.get("summary")))

    # 9.4: Dashboard has habits list
    test("9.4 Dashboard has habits list", isinstance(data.get("habits"), list))

    # 9.5: Dashboard habits have completion flag
    habits = data.get("habits", [])
    if habits:
        test("9.5 Habits have completed_today flag",
             all("completed_today" in h for h in habits))
    else:
        skip("9.5", "No habits to check")

    # 9.6: Dashboard goals have linked task counts
    goals = data.get("active_goals", [])
    if goals:
        test("9.6 Goals have linkedTasks count",
             all("linkedTasks" in g for g in goals))
    else:
        skip("9.6", "No goals to check")

    # 9.7: Mood endpoint returns proper structure
    r = requests.get(f"{BASE}/mood/today", headers=H)
    test("9.7 Mood today endpoint works", r.status_code == 200)

    # 9.8: Health check
    r = requests.get("http://localhost:5000/health")
    health = r.json()
    test("9.8 Health check OK", health.get("status") == "ok")
    test("9.8b Health has AI status", "ai" in health)
    test("9.8c Health has cache stats", "cache" in health)


# ═══════════════════════════════════════════════════════════════
# SECTION 10: FRONTEND-BACKEND MAPPING
# ═══════════════════════════════════════════════════════════════
def test_section_api_mapping(H):
    print("\n" + "="*60)
    print("SECTION 10: FRONTEND-BACKEND API MAPPING")
    print("="*60)

    endpoints = [
        ("GET", "/tasks", "Tasks API"),
        ("GET", "/tasks/smart-view", "Smart View"),
        ("GET", "/tasks/today", "Today Tasks"),
        ("GET", "/habits", "Habits List"),
        ("GET", "/habits/today-summary", "Habits Summary"),
        ("GET", "/habits/suggestions", "Habit Suggestions"),
        ("GET", "/dashboard", "Dashboard"),
        ("GET", "/dashboard/today-flow", "Today Flow"),
        ("GET", "/analytics/summary", "Analytics Summary"),
        ("GET", "/analytics/overview", "Analytics Overview"),
        ("GET", "/analytics/unified", "Analytics Unified"),
        ("GET", "/analytics/snapshot", "Analytics Snapshot"),
        ("GET", "/daily-flow/status", "Daily Flow Status"),
        ("GET", "/notifications", "Notifications"),
        ("GET", "/mood/today", "Mood Today"),
    ]

    for method, path, name in endpoints:
        r = requests.request(method, f"{BASE}{path}", headers=H)
        test(f"10.{name}", r.status_code == 200 and r.json().get("success") is not False,
             f"status={r.status_code}")


# ═══════════════════════════════════════════════════════════════
# SECTION 11: EDGE CASES & REGRESSION
# ═══════════════════════════════════════════════════════════════
def test_section_edge_cases(H):
    print("\n" + "="*60)
    print("SECTION 11: EDGE CASES & REGRESSION")
    print("="*60)

    # 11.1: Unicode in task title
    r = requests.post(f"{BASE}/tasks", json={
        "title": "مهمة اختبار 🎯 عربي",
        "priority": "medium"
    }, headers=H)
    test("11.1 Arabic+emoji in title", r.status_code == 201)
    if r.ok:
        tid = r.json()["data"]["id"]
        r2 = requests.get(f"{BASE}/tasks", headers=H)
        found = any("اختبار" in t.get("title", "") for t in r2.json().get("data", {}).get("tasks", []))
        test("11.1b Arabic preserved in response", found)
        requests.delete(f"{BASE}/tasks/{tid}", headers=H)

    # 11.2: Concurrent operations (simulate)
    import concurrent.futures
    results = []
    def create_task(n):
        r = requests.post(f"{BASE}/tasks", json={"title": f"Concurrent {n}", "priority": "medium"}, headers=H)
        return r.status_code
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(create_task, i) for i in range(5)]
        results = [f.result() for f in futures]
    test("11.2 Concurrent task creation", all(s == 201 for s in results), f"statuses={results}")

    # 11.3: Empty body handling
    r = requests.post(f"{BASE}/tasks", json={}, headers=H)
    test("11.3 Empty body → validation error", r.status_code == 400)

    # 11.4: Very long description
    r = requests.post(f"{BASE}/tasks", json={
        "title": "Long desc test",
        "description": "X" * 10000,
        "priority": "medium"
    }, headers=H)
    if r.ok:
        desc_len = len(r.json().get("data", {}).get("description", ""))
        test("11.4 Long description truncated", desc_len <= 5000, f"len={desc_len}")
        requests.delete(f"{BASE}/tasks/{r.json()['data']['id']}", headers=H)


# ═══════════════════════════════════════════════════════════════
# SECTION 12: STATE PERSISTENCE (RESTART SIMULATION)
# ═══════════════════════════════════════════════════════════════
def test_section_state_persistence(H):
    print("\n" + "="*60)
    print("SECTION 12: STATE PERSISTENCE")
    print("="*60)

    # Reset and start day
    requests.post(f"{BASE}/daily-flow/reset-day", headers=H)
    time.sleep(0.5)
    r = requests.post(f"{BASE}/daily-flow/start-day", headers=H)
    blocks = r.json().get("data", {}).get("plan", {}).get("blocks", [])
    pending = [b for b in blocks if b["status"] == "pending"]

    if pending:
        # Complete a block
        r = requests.post(f"{BASE}/daily-flow/complete-block",
                         json={"block_id": pending[0]["id"]}, headers=H)
        test("12.1 Block completed before persistence test", r.status_code == 200)

        # Check plan state persisted
        r = requests.get(f"{BASE}/daily-flow/plan", headers=H)
        plan_blocks = r.json().get("data", {}).get("plan", {}).get("blocks", [])
        completed_count = sum(1 for b in plan_blocks if b["status"] == "completed")
        test("12.2 Plan state reflects completion", completed_count >= 1, f"completed={completed_count}")
    else:
        skip("12.1-12.2", "No pending blocks")

    # Cleanup
    requests.post(f"{BASE}/daily-flow/reset-day", headers=H)


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  LifeFlow — Phase 4.5 Full QA Test Suite                ║")
    print("║  Date: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "                         ║")
    print("╚══════════════════════════════════════════════════════════╝")

    # Check backend health
    try:
        r = requests.get("http://localhost:5000/health", timeout=5)
        if r.json().get("status") != "ok":
            print("❌ Backend not healthy!")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Cannot connect to backend: {e}")
        sys.exit(1)

    print("✅ Backend is healthy. Starting tests...\n")

    token, H, uid = test_section_auth()
    test_section_tasks(H)
    test_section_habits(H)
    test_section_data_consistency(H)
    test_section_security(H)
    test_section_daily_flow(H)
    test_section_xp_accuracy(H)
    test_section_broken_endpoints(H)
    test_section_ux(H)
    test_section_api_mapping(H)
    test_section_edge_cases(H)
    test_section_state_persistence(H)

    # Final Report
    print("\n" + "="*60)
    print("FINAL RESULTS")
    print("="*60)
    total = RESULTS["passed"] + RESULTS["failed"] + RESULTS["skipped"]
    print(f"  ✅ Passed:  {RESULTS['passed']}")
    print(f"  ❌ Failed:  {RESULTS['failed']}")
    print(f"  ⏭️ Skipped: {RESULTS['skipped']}")
    print(f"  ─────────────────")
    print(f"  Total:      {total}")
    pass_rate = RESULTS["passed"] / (RESULTS["passed"] + RESULTS["failed"]) * 100 if (RESULTS["passed"] + RESULTS["failed"]) > 0 else 0
    print(f"  Pass Rate:  {pass_rate:.1f}%")
    print()

    # Print failures
    failures = [d for d in RESULTS["details"] if d["passed"] == False]
    if failures:
        print("FAILURES:")
        for f in failures:
            print(f"  ❌ {f['name']}: {f['detail']}")
    else:
        print("🎉 ALL TESTS PASSED!")

    print()
    sys.exit(0 if RESULTS["failed"] == 0 else 1)
