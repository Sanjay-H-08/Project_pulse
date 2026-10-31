from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.database.base import Base
from backend.app.database.session import engine, get_db
from backend.app.api.router import api_router
from backend.app.api.health import check_health_status
from backend.app.schemas.health import HealthResponse
# Import all models to ensure they are registered with Base.metadata
import backend.app.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database tables exist upon startup
    Base.metadata.create_all(bind=engine)
    yield


from fastapi.routing import APIRoute

def custom_generate_unique_id(route: APIRoute) -> str:
    tag = route.tags[0] if route.tags else "default"
    methods = "_".join(sorted(route.methods))
    clean_path = route.path_format.strip("/").replace("/", "_").replace("{", "").replace("}", "")
    return f"{tag}_{route.name}_{methods}_{clean_path}"


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan
)

# CORS Configuration
# Supports origins configured in settings plus any local development port regex
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root-level health check alias
@app.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    tags=["Health"],
    operation_id="get_root_health"
)
def get_root_health(db: Session = Depends(get_db)):
    """Root-level health check endpoint."""
    return check_health_status(db)


# Mount API routers under /api and /api/v1
app.include_router(api_router, prefix="/api")
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Welcome to ProgNix API",
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/api/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
