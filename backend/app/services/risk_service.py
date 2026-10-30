from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.models.project import Project
from backend.app.models.task import Task
from backend.app.models.risk import ProjectRisk
from backend.app.schemas.risk import RiskCreate, RiskUpdate, RiskResponse, ProjectRiskSummary
from backend.app.algorithms.risk import calculate_risk, RiskValidationError


def create_risk(db: Session, project_id: int, risk_in: RiskCreate) -> ProjectRisk:
    """
    Creates a new risk entry associated with a project and an optional task.
    Calculates deterministic score and category.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )

    if risk_in.task_id is not None:
        task = db.query(Task).filter(Task.id == risk_in.task_id).first()
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task with ID {risk_in.task_id} not found"
            )
        if task.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Task {risk_in.task_id} does not belong to project {project_id}"
            )

    try:
        score, category = calculate_risk(risk_in.likelihood, risk_in.impact)
    except RiskValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    db_risk = ProjectRisk(
        project_id=project_id,
        task_id=risk_in.task_id,
        title=risk_in.title,
        description=risk_in.description,
        likelihood=risk_in.likelihood,
        impact=risk_in.impact,
        score=score,
        category=category,
        mitigation=risk_in.mitigation
    )
    db.add(db_risk)
    db.commit()
    db.refresh(db_risk)
    return db_risk


def get_risk(db: Session, risk_id: int, project_id: Optional[int] = None) -> ProjectRisk:
    """
    Retrieves a single risk by ID, optionally validating project ownership.
    """
    query = db.query(ProjectRisk).filter(ProjectRisk.id == risk_id)
    if project_id is not None:
        query = query.filter(ProjectRisk.project_id == project_id)
    risk = query.first()
    if not risk:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Risk with ID {risk_id} not found"
        )
    return risk


def get_project_risks(db: Session, project_id: int) -> List[ProjectRisk]:
    """
    Retrieves all risks for a project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )
    return db.query(ProjectRisk).filter(ProjectRisk.project_id == project_id).order_by(ProjectRisk.id).all()


def update_risk(db: Session, db_risk: ProjectRisk, risk_in: RiskUpdate) -> ProjectRisk:
    """
    Updates an existing risk record. Recalculates score and category if likelihood or impact change.
    """
    if risk_in.task_id is not None:
        task = db.query(Task).filter(Task.id == risk_in.task_id).first()
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task with ID {risk_in.task_id} not found"
            )
        if task.project_id != db_risk.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Task {risk_in.task_id} does not belong to project {db_risk.project_id}"
            )
        db_risk.task_id = risk_in.task_id

    if risk_in.title is not None:
        db_risk.title = risk_in.title
    if risk_in.description is not None:
        db_risk.description = risk_in.description
    if risk_in.mitigation is not None:
        db_risk.mitigation = risk_in.mitigation

    new_likelihood = risk_in.likelihood if risk_in.likelihood is not None else db_risk.likelihood
    new_impact = risk_in.impact if risk_in.impact is not None else db_risk.impact

    if risk_in.likelihood is not None or risk_in.impact is not None:
        try:
            score, category = calculate_risk(new_likelihood, new_impact)
            db_risk.likelihood = new_likelihood
            db_risk.impact = new_impact
            db_risk.score = score
            db_risk.category = category
        except RiskValidationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    db.commit()
    db.refresh(db_risk)
    return db_risk


def delete_risk(db: Session, db_risk: ProjectRisk) -> None:
    """
    Deletes a risk record.
    """
    db.delete(db_risk)
    db.commit()


def get_project_risk_summary(db: Session, project_id: int) -> ProjectRiskSummary:
    """
    Calculates summary metrics and risk distribution for all risks in a project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )

    risks = db.query(ProjectRisk).filter(ProjectRisk.project_id == project_id).order_by(ProjectRisk.id).all()
    total_risks = len(risks)

    critical_count = sum(1 for r in risks if r.category == "Critical")
    high_count = sum(1 for r in risks if r.category == "High")
    medium_count = sum(1 for r in risks if r.category == "Medium")
    low_count = sum(1 for r in risks if r.category == "Low")

    if total_risks > 0:
        average_score = round(sum(r.score for r in risks) / total_risks, 2)
        max_score = max(r.score for r in risks)
    else:
        average_score = 0.0
        max_score = 0

    return ProjectRiskSummary(
        project_id=project.id,
        total_risks=total_risks,
        critical_count=critical_count,
        high_count=high_count,
        medium_count=medium_count,
        low_count=low_count,
        average_score=average_score,
        max_score=max_score,
        risks=[RiskResponse.model_validate(r) for r in risks]
    )
