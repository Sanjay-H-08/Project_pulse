from fastapi import APIRouter
from backend.app.api.health import router as health_router
from backend.app.api.projects import router as projects_router
from backend.app.api.tasks import router as tasks_router
from backend.app.api.dependencies import router as dependencies_router
from backend.app.api.schedule import router as schedule_router
from backend.app.api.progress import router as progress_router
from backend.app.api.forecast import router as forecast_router
from backend.app.api.risks import router as risks_router
from backend.app.api.auth import router as auth_router

api_router = APIRouter()

# Include health routes
api_router.include_router(health_router)

# Include auth routes
api_router.include_router(auth_router)

# Include resource routers
api_router.include_router(projects_router)
api_router.include_router(tasks_router)
api_router.include_router(dependencies_router)
api_router.include_router(schedule_router)
api_router.include_router(progress_router)
api_router.include_router(forecast_router)
api_router.include_router(risks_router)
