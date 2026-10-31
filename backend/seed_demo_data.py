#!/usr/bin/env python3
"""
ProgNix — Demo Dataset Seeder
Creates a realistic industrial dataset for "Automated Packaging Line Installation"
Dates are dynamically relative to today's execution date.
Preserves existing user accounts.
"""
import sqlite3
from datetime import date, timedelta, datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "projectpulse.db"

def seed_data():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    print(f"Connecting to database: {DB_PATH}")

    # 1. Clear existing project data (cascading deletes dependencies, schedules, risks, tasks)
    # Clear explicitly in correct order just in case foreign_keys pragma is not enforced
    cursor.execute("DELETE FROM project_schedules;")
    cursor.execute("DELETE FROM project_risks;")
    cursor.execute("DELETE FROM task_dependencies;")
    cursor.execute("DELETE FROM tasks;")
    cursor.execute("DELETE FROM projects;")
    print("Cleared existing projects, tasks, dependencies, schedules, and risks.")

    today = date.today()
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    # 2. Insert main Project
    project_start = today - timedelta(days=25)
    project_deadline = today + timedelta(days=35)

    cursor.execute("""
        INSERT INTO projects (name, description, status, start_date, deadline, team_size, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "Automated Packaging Line Installation",
        "Turnkey installation, PLC automation, robotic pick-and-place, and commissioning of high-speed industrial packaging line.",
        "Active",
        project_start.isoformat(),
        project_deadline.isoformat(),
        5,
        now_str,
        now_str
    ))
    project_id = cursor.lastrowid
    print(f"Created Project: ID={project_id} 'Automated Packaging Line Installation'")

    # 3. Define Tasks (Relative dates to today)
    # Task 1: Mechanical & Conveyor Design (Done)
    t1_start = today - timedelta(days=25)
    t1_end = today - timedelta(days=16)

    # Task 2: Electrical Panel Fabrication (Done)
    t2_start = today - timedelta(days=25)
    t2_end = today - timedelta(days=14)

    # Task 3: PLC Programming (In Progress - 80%)
    t3_start = today - timedelta(days=13)
    t3_end = today + timedelta(days=3)

    # Task 4: Sensor Procurement (Delayed / Overdue - planned end was 10 days ago, progress 60%)
    t4_start = today - timedelta(days=20)
    t4_end = today - timedelta(days=10) # Planned end in past -> Overdue!
    t4_actual_start = today - timedelta(days=18)

    # Task 5: Conveyor Installation (Done)
    t5_start = today - timedelta(days=15)
    t5_end = today - timedelta(days=6)

    # Task 6: Robot Integration (Blocked by Sensor Procurement, To Do - 0%)
    t6_start = today - timedelta(days=5) # Planned start in past, but cannot start
    t6_end = today + timedelta(days=7)

    # Task 7: Safety Inspection (To Do - 0%)
    t7_start = today + timedelta(days=8)
    t7_end = today + timedelta(days=13)

    # Task 8: Testing & Commissioning (To Do - 0%)
    t8_start = today + timedelta(days=14)
    t8_end = today + timedelta(days=24)

    tasks_data = [
        (
            project_id,
            "Mechanical & Conveyor Design",
            "Design mechanical frames, conveyor layouts, and structural load calculations.",
            10, 8.0, 10.0, 14.0,
            t1_start.isoformat(), t1_end.isoformat(),
            t1_start.isoformat(), t1_end.isoformat(),
            "Done", "High", 100, "Chen Wei"
        ),
        (
            project_id,
            "Electrical Panel Fabrication",
            "Assemble primary control enclosure, wiring, circuit breakers, and power distribution.",
            12, 10.0, 12.0, 16.0,
            t2_start.isoformat(), t2_end.isoformat(),
            t2_start.isoformat(), t2_end.isoformat(),
            "Done", "Medium", 100, "Dr. Elena Rostova"
        ),
        (
            project_id,
            "PLC Programming",
            "Ladder logic, structured text routines, safety interlocks, and HMI screen interface.",
            14, 11.0, 14.0, 20.0,
            t3_start.isoformat(), t3_end.isoformat(),
            t3_start.isoformat(), None,
            "In Progress", "High", 80, "Priya Sharma"
        ),
        (
            project_id,
            "Sensor Procurement",
            "Procure optical photo-eyes, proximity sensors, safety light curtains, and barcode scanners (delayed by supply chain).",
            10, 8.0, 10.0, 22.0,
            t4_start.isoformat(), t4_end.isoformat(),
            t4_actual_start.isoformat(), None,
            "In Progress", "High", 60, "David Kalu"
        ),
        (
            project_id,
            "Conveyor Installation",
            "Erect physical conveyors, guide rails, variable speed motor drives, and tension rollers.",
            10, 8.0, 10.0, 13.0,
            t5_start.isoformat(), t5_end.isoformat(),
            t5_start.isoformat(), t5_end.isoformat(),
            "Done", "Medium", 100, "Chen Wei"
        ),
        (
            project_id,
            "Robot Integration",
            "Anchor 6-axis Delta robot arm, mount end-of-arm tooling gripper, and calibrate pick-and-place trajectories (blocked by sensors).",
            12, 10.0, 12.0, 18.0,
            t6_start.isoformat(), t6_end.isoformat(),
            None, None,
            "To Do", "High", 0, "Marcus Vance"
        ),
        (
            project_id,
            "Safety Inspection",
            "OSHA & CE machinery safety audit, E-stop circuit response verification, and light curtain boundary tests.",
            5, 4.0, 5.0, 8.0,
            t7_start.isoformat(), t7_end.isoformat(),
            None, None,
            "To Do", "High", 0, "David Kalu"
        ),
        (
            project_id,
            "Testing & Commissioning",
            "Full-line integrated dry run, high-speed carton packing stress test (120 ppm), and factory acceptance sign-off.",
            10, 8.0, 10.0, 16.0,
            t8_start.isoformat(), t8_end.isoformat(),
            None, None,
            "To Do", "High", 0, "Dr. Elena Rostova"
        )
    ]

    task_id_map = {}
    for t in tasks_data:
        cursor.execute("""
            INSERT INTO tasks (
                project_id, name, description, duration,
                optimistic_duration, most_likely_duration, pessimistic_duration,
                start_date, end_date, actual_start_date, actual_end_date,
                status, priority, progress, assignee, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (*t, now_str, now_str))
        task_id = cursor.lastrowid
        task_name = t[1]
        task_id_map[task_name] = task_id
        print(f"  - Created Task #{task_id}: {task_name} ({t[11]}, {t[13]}%)")

    # 4. Insert Task Dependencies
    # Dependency graph:
    # 1 (Mechanical) -> 5 (Conveyor)
    # 2 (Electrical) -> 3 (PLC)
    # 4 (Sensor Procurement) -> 6 (Robot Integration)
    # 5 (Conveyor Installation) -> 6 (Robot Integration)
    # 6 (Robot Integration) -> 7 (Safety Inspection)
    # 7 (Safety Inspection) -> 8 (Testing & Commissioning)
    # 3 (PLC Programming) -> 8 (Testing & Commissioning)
    dependencies = [
        ("Conveyor Installation", "Mechanical & Conveyor Design"),
        ("PLC Programming", "Electrical Panel Fabrication"),
        ("Robot Integration", "Sensor Procurement"),
        ("Robot Integration", "Conveyor Installation"),
        ("Safety Inspection", "Robot Integration"),
        ("Testing & Commissioning", "Safety Inspection"),
        ("Testing & Commissioning", "PLC Programming"),
    ]

    for successor_name, predecessor_name in dependencies:
        succ_id = task_id_map[successor_name]
        pred_id = task_id_map[predecessor_name]
        cursor.execute("""
            INSERT INTO task_dependencies (project_id, task_id, depends_on_id, dependency_type, lag_days, created_at)
            VALUES (?, ?, ?, 'finish_to_start', 0, ?)
        """, (project_id, succ_id, pred_id, now_str))
        print(f"  - Dependency: '{successor_name}' (ID {succ_id}) depends on '{predecessor_name}' (ID {pred_id})")

    # 5. Insert Project Risks
    risks = [
        (
            project_id,
            task_id_map["Sensor Procurement"],
            "Sensor Supply Chain Component Bottleneck",
            "Global silicon and optoelectronic sensor lead-time delays impacting downstream robot cell integration.",
            5, 4, 20,
            "Supply Chain",
            "Expedite emergency air freight for substitute industrial optical sensors from secondary distributor."
        ),
        (
            project_id,
            task_id_map["PLC Programming"],
            "Fieldbus Communication & I/O Mapping Jitter",
            "High packet latency on PROFINET network causing intermittent cyclic communication faults.",
            3, 4, 12,
            "Technical",
            "Conduct isolated loopback packet analysis and implement shielded CAT6A industrial cables."
        ),
        (
            project_id,
            task_id_map["Safety Inspection"],
            "Emergency E-Stop Hardware Interlock Certification Delay",
            "Third-party regulatory inspector schedule conflict delaying final safety certificate sign-off.",
            2, 5, 10,
            "Compliance",
            "Pre-audit dual-channel safety relays with certified third-party TÜV inspector before formal sign-off."
        ),
        (
            project_id,
            task_id_map["Robot Integration"],
            "Robot Tool-Center-Point Calibration Drift",
            "Vibrational harmonics from high-speed conveyor causing minor TCP offset during carton pick-and-place.",
            2, 3, 6,
            "Operational",
            "Implement daily laser-guided zero-point calibration and routine gripper torque monitoring."
        )
    ]

    for r in risks:
        cursor.execute("""
            INSERT INTO project_risks (
                project_id, task_id, title, description, likelihood, impact, score, category, mitigation, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (*r, now_str, now_str))
        print(f"  - Created Risk: '{r[2]}' (Score: {r[6]}, Category: {r[7]})")

    conn.commit()

    # Verify counts
    cursor.execute("SELECT count(*) FROM users;")
    user_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM projects;")
    proj_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM tasks;")
    task_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM task_dependencies;")
    dep_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM project_risks;")
    risk_count = cursor.fetchone()[0]

    print(f"\n--- SEEDING COMPLETE ---")
    print(f"Preserved Users: {user_count}")
    print(f"Projects: {proj_count}")
    print(f"Tasks: {task_count}")
    print(f"Dependencies: {dep_count}")
    print(f"Risks: {risk_count}")

    conn.close()

if __name__ == "__main__":
    seed_data()
