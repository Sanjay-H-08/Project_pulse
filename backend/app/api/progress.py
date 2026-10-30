from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.api.deps import get_db
from backend.app.schemas.progress import ProjectProgressSummary
from backend.app.services.progress_service import get_project_progress

router = APIRouter(prefix="/projects", tags=["Progress"])


@router.get(
    "/{project_id}/progress",
    response_model=ProjectProgressSummary,
    status_code=status.HTTP_200_OK
)
def get_project_progress_endpoint(
    project_id: int,
    as_of_date: Optional[date] = Query(None, description="Reference date for progress comparison (default: today)"),
    db: Session = Depends(get_db)
):
    """
    Computes planned vs actual progress comparison, schedule variance, and status classification
    for all tasks in the project as of the specified date.
    """
    return get_project_progress(db=db, project_id=project_id, as_of_date=as_of_date)


@router.get(
    "/{project_id}/progress/analysis",
    response_model=ProjectProgressSummary,
    status_code=status.HTTP_200_OK
)
def get_project_progress_analysis_endpoint(
    project_id: int,
    as_of_date: Optional[date] = Query(None, description="Reference date for progress analysis (default: today)"),
    db: Session = Depends(get_db)
):
    """
    Detailed progress analysis and health metrics for the project.
    """
    return get_project_progress(db=db, project_id=project_id, as_of_date=as_of_date)
