from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.app.api.deps import get_db
from backend.app.core.config import settings
from backend.app.schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


def check_health_status(db: Session) -> HealthResponse:
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return HealthResponse(
        status="healthy" if db_status == "connected" else "degraded",
        service="projectpulse-backend",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        database=db_status
    )


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
)
def get_health(db: Session = Depends(get_db)):
    """Health check endpoint to verify backend service and database status."""
    return check_health_status(db)
