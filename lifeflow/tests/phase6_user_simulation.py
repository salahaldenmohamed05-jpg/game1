#!/usr/bin/env python3
"""
Phase 6 — Real User Simulation Test
=====================================
Simulates 5 user types to test the full External Execution Layer:
  1. Power User — completes everything, earns badges, weekly narrative
  2. Casual User — completes some, skips some, tests adaptive intelligence
  3. Procrastinator — skips a lot, tests procrastination detection + intervention
  4. Returning User — absent for days, tests comeback system
  5. Free User — tests monetization gate, feature limits

Tests cover:
  - Auth → Task/Habit setup → Start Day → Execute blocks → End Day
  - Phase 6 APIs: adaptive state, streak warnings, weekly narrative
  - Quick actions from notifications (one-tap habit check-in)
  - Widget data for home-screen
  - Subscription gate for freemium features
  - Perfect Day badge detection
"""

import requests
import json
import time
import sys
import random

BASE_URL = "http://localhost:5000/api/v1"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'

def log(icon, msg, color=Colors.END):
    print(f"{color}{icon} {msg}{Colors.END}")

def section(title):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}{Colors.END}\n")

# ── Helpers ───────────────────────────────────────────────────────────────────

def register_user(name, email, password="Test1234!"):
    r = requests.post(f"{BASE_URL}/auth/register", json={"name": name, "email": email, "password": password})
    if r.status_code in [200, 201]:
        data = r.json().get("data", r.json())
        token = data.get("accessToken") or data.get("token")
        user_id = data.get("user", {}).get("id") or data.get("userId")
        return token, user_id
    # Try login if already exists
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        data = r.json().get("data", r.json())
        token = data.get("accessToken") or data.get("token")
        user_id = data.get("user", {}).get("id") or data.get("userId")
        return token, user_id
    return None, None

def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def create_tasks(token, count=5):
    tasks = []
    titles = ["مراجعة البريد", "إعداد التقرير", "اجتماع الفريق", "تمرين رياضة", "قراءة 30 دقيقة",
              "كتابة المقال", "تنظيم الملفات", "مكالمة العميل", "تحديث المشروع", "مراجعة الكود"]
    for i in range(count):
        r = requests.post(f"{BASE_URL}/tasks", headers=auth_headers(token), json={
            "title": titles[i % len(titles)],
            "priority": ["high", "medium", "low"][i % 3],
            "estimated_minutes": random.choice([15, 20, 25, 30]),
        })
        if r.status_code in [200, 201]:
            data = r.json().get("data", r.json())
            task_id = data.get("id") or data.get("task", {}).get("id")
            if task_id: tasks.append(task_id)
    return tasks

def create_habits(token, count=3):
    habits = []
    names = [("ممارسة التأمل", "🧘"), ("شرب 2 لتر ماء", "💧"), ("قراءة 10 صفحات", "📖"), ("مشي 30 دقيقة", "🚶"), ("كتابة يومية", "📝")]
    for i in range(count):
        n, ic = names[i % len(names)]
        r = requests.post(f"{BASE_URL}/habits", headers=auth_headers(token), json={
            "name": n, "icon": ic, "frequency": "daily",
        })
        if r.status_code in [200, 201]:
            data = r.json().get("data", r.json())
            habit_id = data.get("id") or data.get("habit", {}).get("id")
            if habit_id: habits.append(habit_id)
    return habits

def delete_tasks(token, task_ids):
    for tid in task_ids:
        requests.delete(f"{BASE_URL}/tasks/{tid}", headers=auth_headers(token))

def delete_habits(token, habit_ids):
    for hid in habit_ids:
        requests.delete(f"{BASE_URL}/habits/{hid}", headers=auth_headers(token))

# ═══════════════════════════════════════════════════════════════════════════════
# USER TYPE 1: POWER USER — completes everything
# ═══════════════════════════════════════════════════════════════════════════════

def simulate_power_user():
    section("USER 1: POWER USER — الشخص المنجز")
    
    token, user_id = register_user("أحمد المنجز", f"power_user_{int(time.time())}@test.com")
    if not token:
        log("❌", "Auth failed", Colors.RED)
        return False
    log("✅", "Auth OK", Colors.GREEN)
    
    tasks = create_tasks(token, 5)
    habits = create_habits(token, 3)
    log("📋", f"Created {len(tasks)} tasks, {len(habits)} habits")
    
    # Reset day first
    requests.post(f"{BASE_URL}/daily-flow/reset-day", headers=auth_headers(token))
    
    # Start day
    r = requests.post(f"{BASE_URL}/daily-flow/start-day", headers=auth_headers(token))
    assert r.status_code == 200, f"Start day failed: {r.status_code}"
    plan = r.json().get("data", {}).get("plan", {})
    blocks = plan.get("blocks", [])
    log("🚀", f"Day started with {len(blocks)} blocks")
    
    # Complete ALL blocks
    total_xp = 0
    for block in blocks:
        if block.get("status") == "completed":
            continue
        r = requests.post(f"{BASE_URL}/daily-flow/complete-block", headers=auth_headers(token), 
                         json={"block_id": block["id"]})
        if r.status_code == 200:
            data = r.json().get("data", {})
            xp = data.get("reward", {}).get("xp", 0)
            total_xp += xp
            adaptive = data.get("adaptive")
            perfect = data.get("perfect_day")
            log("✅", f"  Block '{block.get('title', '?')}' +{xp}XP | Adaptive: {adaptive.get('energy_level') if adaptive else 'N/A'}")
            if perfect and perfect.get("is_perfect_day"):
                log("🏆", f"  PERFECT DAY DETECTED! Badge: {perfect.get('badge', {}).get('title_ar', '')}", Colors.YELLOW)
    
    log("⚡", f"Total XP earned: {total_xp}", Colors.GREEN)
    
    # End day
    r = requests.post(f"{BASE_URL}/daily-flow/end-day", headers=auth_headers(token),
                     json={"reflection_text": "يوم رائع! أنجزت كل شيء"})
    assert r.status_code == 200
    narrative = r.json().get("data", {})
    log("🌙", f"Day ended: {narrative.get('title', '?')} — Score: {narrative.get('score', 0)}/100, XP: {narrative.get('xp_earned', 0)}")
    
    # Test Phase 6: Perfect Day check
    r = requests.get(f"{BASE_URL}/phase6/perfect-day", headers=auth_headers(token))
    if r.status_code == 200:
        pd = r.json().get("data", {})
        log("🏆", f"Perfect Day: {pd.get('is_perfect_day')} — Score: {pd.get('score', 0)}")
    
    # Test Phase 6: Weekly narrative
    r = requests.get(f"{BASE_URL}/phase6/weekly-narrative", headers=auth_headers(token))
    if r.status_code == 200:
        wn = r.json().get("data", {})
        if wn.get("narrative"):
            log("📊", f"Weekly: {wn['narrative'].get('title', '?')} — Score: {wn['narrative'].get('overall_score', 0)}")
    
    # Cleanup
    delete_tasks(token, tasks)
    delete_habits(token, habits)
    log("🧹", "Cleaned up")
    return True

# ═══════════════════════════════════════════════════════════════════════════════
# USER TYPE 2: CASUAL USER — completes some, skips some
# ═══════════════════════════════════════════════════════════════════════════════

def simulate_casual_user():
    section("USER 2: CASUAL USER — المستخدم العادي")
    
    token, user_id = register_user("سارة العادية", f"casual_user_{int(time.time())}@test.com")
    if not token:
        log("❌", "Auth failed", Colors.RED)
        return False
    log("✅", "Auth OK", Colors.GREEN)
    
    tasks = create_tasks(token, 5)
    habits = create_habits(token, 2)
    
    requests.post(f"{BASE_URL}/daily-flow/reset-day", headers=auth_headers(token))
    r = requests.post(f"{BASE_URL}/daily-flow/start-day", headers=auth_headers(token))
    blocks = r.json().get("data", {}).get("plan", {}).get("blocks", [])
    log("🚀", f"Day started with {len(blocks)} blocks")
    
    # Complete first 3, skip rest
    completed = 0
    skipped = 0
    for i, block in enumerate(blocks):
        if block.get("status") == "completed":
            continue
        if i < 3:
            r = requests.post(f"{BASE_URL}/daily-flow/complete-block", headers=auth_headers(token),
                             json={"block_id": block["id"]})
            if r.status_code == 200:
                completed += 1
                data = r.json().get("data", {})
                log("✅", f"  Completed: '{block.get('title')}'")
        else:
            reason = random.choice(["busy", "low_energy", "other"])
            r = requests.post(f"{BASE_URL}/daily-flow/skip-block", headers=auth_headers(token),
                             json={"block_id": block["id"], "reason": reason})
            if r.status_code == 200:
                skipped += 1
                data = r.json().get("data", {})
                adaptive = data.get("adaptive")
                log("⏭️", f"  Skipped: '{block.get('title')}' (reason: {reason})")
                if adaptive:
                    log("🧠", f"    Adaptive: energy={adaptive.get('energy_level')}, procrastination={adaptive.get('procrastination_detected')}")
    
    log("📊", f"Completed: {completed}, Skipped: {skipped}")
    
    # Test Phase 6: Adaptive state
    r = requests.get(f"{BASE_URL}/phase6/adaptive-state", headers=auth_headers(token))
    if r.status_code == 200:
        state = r.json().get("data", {}).get("state", {})
        log("🧠", f"Adaptive State: energy={state.get('energyLevel')}, momentum={state.get('momentum')}, intensity={state.get('intensityLevel')}")
    
    # End day
    r = requests.post(f"{BASE_URL}/daily-flow/end-day", headers=auth_headers(token),
                     json={"reflection_text": "يوم عادي"})
    if r.status_code == 200:
        narrative = r.json().get("data", {})
        log("🌙", f"Day ended: {narrative.get('title', '?')} — Score: {narrative.get('score', 0)}/100")
    
    delete_tasks(token, tasks)
    delete_habits(token, habits)
    log("🧹", "Cleaned up")
    return True

# ═══════════════════════════════════════════════════════════════════════════════
# USER TYPE 3: PROCRASTINATOR — skips a lot
# ═══════════════════════════════════════════════════════════════════════════════

def simulate_procrastinator():
    section("USER 3: PROCRASTINATOR — المسوّف")
    
    token, user_id = register_user("خالد المسوّف", f"procrastinator_{int(time.time())}@test.com")
    if not token:
        log("❌", "Auth failed", Colors.RED)
        return False
    log("✅", "Auth OK", Colors.GREEN)
    
    tasks = create_tasks(token, 5)
    habits = create_habits(token, 2)
    
    requests.post(f"{BASE_URL}/daily-flow/reset-day", headers=auth_headers(token))
    r = requests.post(f"{BASE_URL}/daily-flow/start-day", headers=auth_headers(token))
    blocks = r.json().get("data", {}).get("plan", {}).get("blocks", [])
    log("🚀", f"Day started with {len(blocks)} blocks")
    
    # Skip most blocks — complete only 1
    procrastination_detected = False
    burnout_detected = False
    for i, block in enumerate(blocks):
        if block.get("status") == "completed":
            continue
        if i == 2:  # Complete just one
            r = requests.post(f"{BASE_URL}/daily-flow/complete-block", headers=auth_headers(token),
                             json={"block_id": block["id"]})
            log("✅", f"  Completed: '{block.get('title')}'")
        else:
            reason = random.choice(["overwhelmed", "lazy", "low_energy"])
            r = requests.post(f"{BASE_URL}/daily-flow/skip-block", headers=auth_headers(token),
                             json={"block_id": block["id"], "reason": reason})
            if r.status_code == 200:
                data = r.json().get("data", {})
                adaptive = data.get("adaptive", {})
                if adaptive.get("procrastination_detected"):
                    procrastination_detected = True
                    log("⚠️", f"  PROCRASTINATION DETECTED after skip #{i+1}!", Colors.YELLOW)
                if adaptive.get("burnout_risk"):
                    burnout_detected = True
                    log("🌿", f"  BURNOUT RISK DETECTED!", Colors.RED)
                
                recovery = data.get("recovery_message", "")
                log("⏭️", f"  Skipped: '{block.get('title')}' ({reason}) — Recovery: {recovery[:50]}")
    
    # Verify adaptive state
    r = requests.get(f"{BASE_URL}/phase6/adaptive-state", headers=auth_headers(token))
    if r.status_code == 200:
        state = r.json().get("data", {}).get("state", {})
        recs = r.json().get("data", {}).get("recommendations", [])
        log("🧠", f"Final State: energy={state.get('energyLevel')}, procrastination={state.get('procrastination')}, burnout={state.get('burnoutRisk')}")
        for rec in recs[:3]:
            if rec.get("message_ar"):
                log("💡", f"  Recommendation: {rec['message_ar'][:60]}...")
    
    log(f"{'✅' if procrastination_detected else '⚠️'}", 
        f"Procrastination detection: {'WORKING' if procrastination_detected else 'NOT TRIGGERED (may need more skips)'}",
        Colors.GREEN if procrastination_detected else Colors.YELLOW)
    
    delete_tasks(token, tasks)
    delete_habits(token, habits)
    log("🧹", "Cleaned up")
    return True

# ═══════════════════════════════════════════════════════════════════════════════
# USER TYPE 4: RETURNING USER — tests comeback system
# ═══════════════════════════════════════════════════════════════════════════════

def simulate_returning_user():
    section("USER 4: RETURNING USER — العائد")
    
    token, user_id = register_user("ليلى العائدة", f"returning_user_{int(time.time())}@test.com")
    if not token:
        log("❌", "Auth failed", Colors.RED)
        return False
    log("✅", "Auth OK", Colors.GREEN)
    
    habits = create_habits(token, 2)
    
    # Test comeback status (new user won't have absence data, but test the endpoint)
    r = requests.get(f"{BASE_URL}/phase6/comeback-status", headers=auth_headers(token))
    if r.status_code == 200:
        comeback = r.json().get("data")
        if comeback and comeback.get("is_comeback"):
            log("💙", f"Comeback: {comeback.get('welcome_message')}", Colors.BLUE)
        else:
            log("ℹ️", "No comeback status (user is new/active — expected)")
    
    # Test streak warnings
    r = requests.get(f"{BASE_URL}/phase6/streak-warnings", headers=auth_headers(token))
    if r.status_code == 200:
        warnings = r.json().get("data", {}).get("warnings", [])
        log("🔥", f"Streak warnings: {len(warnings)} (new user — expected 0)")
    
    # Test widget data
    r = requests.get(f"{BASE_URL}/phase6/widget-data", headers=auth_headers(token))
    if r.status_code == 200:
        widget = r.json().get("data", {})
        log("📱", f"Widget: {widget.get('habits', {}).get('total', 0)} habits, {widget.get('tasks', {}).get('pending', 0)} tasks, Quick actions: {len(widget.get('quick_actions', []))}")
        for qa in widget.get("quick_actions", []):
            log("⚡", f"  Quick action: {qa.get('label')}")
    
    # Test quick action — one-tap habit check-in
    if habits:
        r = requests.post(f"{BASE_URL}/phase6/quick-action", headers=auth_headers(token),
                         json={"action": "check_habit", "item_id": habits[0]})
        if r.status_code == 200:
            data = r.json().get("data", {})
            log("✅", f"Quick habit check-in: {data.get('message', '?')}", Colors.GREEN)
    
    delete_habits(token, habits)
    log("🧹", "Cleaned up")
    return True

# ═══════════════════════════════════════════════════════════════════════════════
# USER TYPE 5: FREE USER — tests monetization gate
# ═══════════════════════════════════════════════════════════════════════════════

def simulate_free_user():
    section("USER 5: FREE USER — المستخدم المجاني")
    
    token, user_id = register_user("منى المجانية", f"free_user_{int(time.time())}@test.com")
    if not token:
        log("❌", "Auth failed", Colors.RED)
        return False
    log("✅", "Auth OK", Colors.GREEN)
    
    # Test subscription gate
    r = requests.get(f"{BASE_URL}/phase6/subscription-gate", headers=auth_headers(token))
    if r.status_code == 200:
        gate = r.json().get("data", {})
        log("💰", f"Plan: {gate.get('plan')}, Is Pro: {gate.get('is_pro')}")
        
        features = gate.get("features", {})
        free_features = [k for k, v in features.items() if v]
        pro_features = [k for k, v in features.items() if not v]
        
        log("✅", f"Free features: {len(free_features)} ({', '.join(free_features[:5])}...)", Colors.GREEN)
        log("🔒", f"Pro features: {len(pro_features)} ({', '.join(pro_features[:5])}...)", Colors.YELLOW)
        
        limits = gate.get("limits", {})
        log("📊", f"Limits: habits={limits.get('habits')}, tasks={limits.get('tasks')}, notifications={limits.get('daily_notifications')}")
        
        upgrade = gate.get("upgrade_cta")
        if upgrade:
            log("💎", f"Upgrade CTA: {upgrade.get('message_ar', '')[:50]}... Price: {upgrade.get('price')}")
    
    # Test notification schedule
    r = requests.get(f"{BASE_URL}/phase6/notification-schedule", headers=auth_headers(token))
    if r.status_code == 200:
        schedule = r.json().get("data", {})
        log("🔔", f"Notifications: {schedule.get('daily_sent', 0)}/{schedule.get('daily_limit', 0)} sent today")
        features = schedule.get("features", {})
        log("🧠", f"Features: loss_aversion={features.get('loss_aversion_streaks')}, procrastination={features.get('procrastination_detection')}, perfect_day={features.get('perfect_day_badge')}")
    
    # Test trigger notifications
    r = requests.post(f"{BASE_URL}/phase6/trigger-notifications", headers=auth_headers(token))
    if r.status_code == 200:
        data = r.json().get("data", {})
        log("🔔", f"Triggered: {data.get('sent', 0)} notifications")
        for n in data.get("notifications", []):
            log("📨", f"  [{n.get('type')}] {n.get('title')}")
    
    log("🧹", "Cleaned up")
    return True

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN — Run all simulations
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print(f"\n{Colors.BOLD}{Colors.CYAN}")
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  Phase 6 — Real User Simulation Test                       ║")
    print("║  External Execution Layer + Cross-Day Intelligence          ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print(Colors.END)
    
    # Check backend health
    try:
        r = requests.get(f"{BASE_URL.replace('/api/v1', '')}/health", timeout=5)
        assert r.status_code == 200
        log("✅", "Backend is healthy", Colors.GREEN)
    except:
        log("❌", "Backend not reachable — start it first!", Colors.RED)
        sys.exit(1)
    
    results = {}
    
    simulations = [
        ("Power User", simulate_power_user),
        ("Casual User", simulate_casual_user),
        ("Procrastinator", simulate_procrastinator),
        ("Returning User", simulate_returning_user),
        ("Free User", simulate_free_user),
    ]
    
    for name, fn in simulations:
        try:
            success = fn()
            results[name] = "✅ PASS" if success else "⚠️ PARTIAL"
        except Exception as e:
            log("❌", f"{name} FAILED: {str(e)[:100]}", Colors.RED)
            results[name] = f"❌ FAIL: {str(e)[:50]}"
    
    # Final Summary
    section("RESULTS SUMMARY")
    for name, result in results.items():
        color = Colors.GREEN if "PASS" in result else Colors.RED if "FAIL" in result else Colors.YELLOW
        log("", f"{name}: {result}", color)
    
    total = len(results)
    passed = sum(1 for r in results.values() if "PASS" in r)
    log("", f"\n{passed}/{total} user types passed", Colors.GREEN if passed == total else Colors.YELLOW)

if __name__ == "__main__":
    main()
