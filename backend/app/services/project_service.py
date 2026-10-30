from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.models.project import Project
from backend.app.models.task import Task
from backend.app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse


def get_project(db: Session, project_id: int) -> Optional[Project]:
    return db.query(Project).filter(Project.id == project_id).first()


def get_projects(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    search: Optional[str] = None
) -> List[Project]:
    query = db.query(Project)
    if status:
        query = query.filter(Project.status == status)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Project.name.ilike(search_pattern)) |
            (Project.description.ilike(search_pattern))
        )
    return query.order_by(Project.id.asc()).offset(skip).limit(limit).all()


def create_project(db: Session, project_in: ProjectCreate) -> Project:
    db_project = Project(
        name=project_in.name,
        description=project_in.description,
        status=project_in.status or "Planned",
        start_date=project_in.start_date,
        deadline=project_in.deadline,
        team_size=project_in.team_size or 1,
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


def update_project(db: Session, db_project: Project, project_in: ProjectUpdate) -> Project:
    update_data = project_in.model_dump(exclude_unset=True)
    eff_start = update_data.get("start_date", db_project.start_date)
    eff_deadline = update_data.get("deadline", db_project.deadline)
    if eff_start and eff_deadline and eff_deadline < eff_start:
        raise ValueError("Deadline cannot be earlier than the start date")

    for field, value in update_data.items():
        setattr(db_project, field, value)
    db.commit()
    db.refresh(db_project)
    return db_project


def delete_project(db: Session, db_project: Project) -> None:
    db.delete(db_project)
    db.commit()


def to_project_response(db: Session, project: Project) -> ProjectResponse:
    tasks_count = db.query(func.count(Task.id)).filter(Task.project_id == project.id).scalar() or 0
    resp = ProjectResponse.model_validate(project)
    resp.tasks_count = tasks_count
    return resp
