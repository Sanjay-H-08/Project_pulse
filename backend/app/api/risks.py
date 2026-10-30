from typing import List, Optional
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from backend.app.api.deps import get_db
from backend.app.schemas.risk import RiskCreate, RiskUpdate, RiskResponse, ProjectRiskSummary
from backend.app.services.risk_service import (
    create_risk,
    get_risk,
    get_project_risks,
    update_risk,
    delete_risk,
    get_project_risk_summary,
)

router = APIRouter(prefix="/projects", tags=["Risks"])


@router.post(
    "/{project_id}/risks",
    response_model=RiskResponse,
    status_code=status.HTTP_201_CREATED
)
def create_project_risk_endpoint(
    project_id: int,
    risk_in: RiskCreate,
    db: Session = Depends(get_db)
):
    """
    Creates a new risk entry associated with a project and an optional task.
    Score and severity category are calculated automatically based on likelihood (1-5) and impact (1-5).
    """
    return create_risk(db=db, project_id=project_id, risk_in=risk_in)


@router.get(
    "/{project_id}/risks",
    response_model=List[RiskResponse],
    status_code=status.HTTP_200_OK
)
def list_project_risks_endpoint(
    project_id: int,
    db: Session = Depends(get_db)
):
    """
    Lists all risks for a given project with their calculated scores and categories.
    """
    return get_project_risks(db=db, project_id=project_id)


@router.get(
    "/{project_id}/risks/summary",
    response_model=ProjectRiskSummary,
    status_code=status.HTTP_200_OK
)
def get_project_risk_summary_endpoint(
    project_id: int,
    db: Session = Depends(get_db)
):
    """
    Returns summary statistics, category breakdown, and risk items for a project.
    """
    return get_project_risk_summary(db=db, project_id=project_id)


@router.get(
    "/{project_id}/risks/{risk_id}",
    response_model=RiskResponse,
    status_code=status.HTTP_200_OK
)
def get_single_risk_endpoint(
    project_id: int,
    risk_id: int,
    db: Session = Depends(get_db)
):
    """
    Retrieves a single risk by ID within the project.
    """
    return get_risk(db=db, risk_id=risk_id, project_id=project_id)


@router.put(
    "/{project_id}/risks/{risk_id}",
    response_model=RiskResponse,
    status_code=status.HTTP_200_OK
)
def update_project_risk_endpoint(
    project_id: int,
    risk_id: int,
    risk_in: RiskUpdate,
    db: Session = Depends(get_db)
):
    """
    Updates an existing project risk. Recalculates score and category if likelihood or impact are changed.
    """
    db_risk = get_risk(db=db, risk_id=risk_id, project_id=project_id)
    return update_risk(db=db, db_risk=db_risk, risk_in=risk_in)


@router.delete(
    "/{project_id}/risks/{risk_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_project_risk_endpoint(
    project_id: int,
    risk_id: int,
    db: Session = Depends(get_db)
):
    """
    Deletes a risk by ID.
    """
    db_risk = get_risk(db=db, risk_id=risk_id, project_id=project_id)
    delete_risk(db=db, db_risk=db_risk)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
