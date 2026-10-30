from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.api.deps import get_db
from backend.app.schemas.forecast import ProjectForecastResponse, TaskDelayImpactResponse
from backend.app.schemas.simulation import WhatIfSimulationRequest, WhatIfSimulationResponse
from backend.app.services.forecast_service import (
    compute_project_forecast,
    analyze_task_delay_impact,
    simulate_project_delays,
)

router = APIRouter(prefix="/projects", tags=["Forecasting & Delay Intelligence"])


@router.get(
    "/{project_id}/forecast",
    response_model=ProjectForecastResponse,
    status_code=status.HTTP_200_OK
)
def get_project_forecast_endpoint(
    project_id: int,
    as_of_date: Optional[date] = Query(None, description="Reference date for forecast calculation (default: today)"),
    db: Session = Depends(get_db)
):
    """
    Computes deterministic remaining work and completion forecast using Earned Duration and CPM.
    Does not modify baseline schedules or original task durations.
    """
    return compute_project_forecast(db=db, project_id=project_id, as_of_date=as_of_date)


@router.get(
    "/{project_id}/tasks/{task_id}/delay-impact",
    response_model=TaskDelayImpactResponse,
    status_code=status.HTTP_200_OK
)
def get_task_delay_impact_endpoint(
    project_id: int,
    task_id: int,
    delay_days: Optional[float] = Query(None, description="Hypothetical delay days to evaluate (default: 0.0)"),
    db: Session = Depends(get_db)
):
    """
    Evaluates the impact of a task delay on downstream activities, float consumption,
    and overall project completion.
    """
    return analyze_task_delay_impact(
        db=db,
        project_id=project_id,
        task_id=task_id,
        delay_days=delay_days
    )


@router.post(
    "/{project_id}/simulate",
    response_model=WhatIfSimulationResponse,
    status_code=status.HTTP_200_OK
)
def simulate_delays_endpoint(
    project_id: int,
    simulation_req: WhatIfSimulationRequest,
    db: Session = Depends(get_db)
):
    """
    Executes a read-only What-If multi-task delay simulation using CPM.
    Evaluates project-level delay, new critical path, and float consumption without mutating database state.
    """
    return simulate_project_delays(
        db=db,
        project_id=project_id,
        simulation_req=simulation_req
    )
