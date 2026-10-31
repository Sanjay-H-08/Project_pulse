import os
from datetime import date, timedelta
from backend.app.database.session import SessionLocal, engine
from backend.app.database.base import Base
from backend.app.models.project import Project
from backend.app.models.task import Task
from backend.app.models.dependency import TaskDependency

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Check if data already exists
    if db.query(Project).count() > 0:
        # clear any incomplete data
        db.query(TaskDependency).delete()
        db.query(Task).delete()
        db.query(Project).delete()
        db.commit()

    print("Seeding database with initial project and CPM/PERT tasks...")
    today = date.today()

    p1 = Project(
        name="Campus Event App",
        description="Mobile app for the college fest featuring CPM/PERT schedules",
        status="Active",
        start_date=today - timedelta(days=12),
        deadline=today + timedelta(days=40),
        team_size=4
    )
    p2 = Project(
        name="Website Redesign",
        description="New department website with modern UX",
        status="Completed",
        start_date=today - timedelta(days=30),
        deadline=today - timedelta(days=5),
        team_size=2
    )
    db.add_all([p1, p2])
    db.commit()
    db.refresh(p1)
    db.refresh(p2)

    # Tasks for Project 1
    tasks_data = [
        {"name": "Gather requirements", "s": -12, "e": -6, "prog": 100, "user": "Aisha", "status": "Done", "pri": "High", "opt": 5, "likely": 7, "pess": 11},
        {"name": "Design UI mockups", "s": -6, "e": 4, "prog": 70, "user": "Meera", "status": "In Progress", "pri": "High", "opt": 8, "likely": 11, "pess": 16},
        {"name": "Build login and API", "s": 0, "e": 14, "prog": 35, "user": "Rahul", "status": "In Progress", "pri": "High", "opt": 10, "likely": 15, "pess": 22},
        {"name": "Event listing screens", "s": 8, "e": 22, "prog": 0, "user": "Dev", "status": "To Do", "pri": "Medium", "opt": 12, "likely": 15, "pess": 20},
        {"name": "Testing and bug fixes", "s": 22, "e": 32, "prog": 0, "user": "Aisha", "status": "To Do", "pri": "Medium", "opt": 8, "likely": 11, "pess": 17},
        {"name": "Launch and demo", "s": 32, "e": 40, "prog": 0, "user": "Rahul", "status": "To Do", "pri": "Low", "opt": 6, "likely": 9, "pess": 14},
    ]

    created_tasks = []
    for td in tasks_data:
        s_date = today + timedelta(days=td["s"])
        e_date = today + timedelta(days=td["e"])
        dur = (e_date - s_date).days + 1
        t = Task(
            project_id=p1.id,
            name=td["name"],
            start_date=s_date,
            end_date=e_date,
            duration=dur,
            progress=td["prog"],
            assignee=td["user"],
            status=td["status"],
            priority=td["pri"],
            optimistic_duration=td["opt"],
            most_likely_duration=td["likely"],
            pessimistic_duration=td["pess"]
        )
        db.add(t)
        created_tasks.append(t)

    db.commit()
    for t in created_tasks:
        db.refresh(t)

    # Dependencies (Task 2 -> Task 1; Task 3 -> Task 1; Task 4 -> Task 2; Task 5 -> Task 3 & 4; Task 6 -> Task 5)
    # task_id depends on depends_on_id
    deps = [
        (created_tasks[1].id, created_tasks[0].id),
        (created_tasks[2].id, created_tasks[0].id),
        (created_tasks[3].id, created_tasks[1].id),
        (created_tasks[4].id, created_tasks[2].id),
        (created_tasks[4].id, created_tasks[3].id),
        (created_tasks[5].id, created_tasks[4].id),
    ]

    for task_id, pred_id in deps:
        dep = TaskDependency(
            project_id=p1.id,
            task_id=task_id,
            depends_on_id=pred_id,
            dependency_type="finish_to_start",
            lag_days=0
        )
        db.add(dep)

    db.commit()
    db.close()
    print("Database seeded successfully with projects, tasks, and dependencies!")

if __name__ == "__main__":
    seed()
