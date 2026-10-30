from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "projectpulse-backend"
    version: str
    environment: str
    database: str = "connected"
