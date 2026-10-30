from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.api.deps import get_db
from backend.app.schemas.schedule import ScheduleRequest, ProjectScheduleResponse
from backend.app.services.scheduling_service import (
    compute_and_save_schedule,
    get_project_schedule,
    SchedulingServiceError,
)

router = APIRouter(prefix="/projects", tags=["Scheduling"])


@router.post(
    "/{project_id}/schedule",
    response_model=ProjectScheduleResponse,
    status_code=status.HTTP_200_OK
)
def calculate_schedule_endpoint(
    project_id: int,
    request: Optional[ScheduleRequest] = None,
    use_pert: Optional[bool] = Query(None, description="Override whether to use PERT expected durations"),
    db: Session = Depends(get_db)
):
    """
    Calculates project schedule using Critical Path Method (CPM) and optional PERT estimation.
    Determines:
    - Minimum project duration
    - Early Start (ES) & Early Finish (EF)
    - Late Start (LS) & Late Finish (LF)
    - Total float / slack for each task
    - Critical path(s) and critical tasks
    Persists the schedule separately for baseline vs PERT without overwriting original task durations.
    """
    effective_use_pert = False
    task_pert_estimates = None

    if request:
        effective_use_pert = request.use_pert
        task_pert_estimates = request.task_pert_estimates

    if use_pert is not None:
        effective_use_pert = use_pert

    try:
        return compute_and_save_schedule(
            db=db,
            project_id=project_id,
            use_pert=effective_use_pert,
            task_pert_estimates=task_pert_estimates
        )
    except SchedulingServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get(
    "/{project_id}/schedule",
    response_model=ProjectScheduleResponse,
    status_code=status.HTTP_200_OK
)
def get_schedule_endpoint(
    project_id: int,
    use_pert: bool = Query(False, description="Retrieve PERT schedule if true, or baseline CPM schedule if false"),
    db: Session = Depends(get_db)
):
    """
    Retrieves the latest calculated project schedule.
    Guarantees freshness: If tasks or dependencies were modified or the schedule is stale,
    it automatically re-runs CPM and returns the fresh schedule.
    """
    try:
        return get_project_schedule(
            db=db,
            project_id=project_id,
            use_pert=use_pert
        )
    except SchedulingServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
