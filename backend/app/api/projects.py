from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.api.deps import get_db
from backend.app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from backend.app.schemas.task import TaskResponse
from backend.app.schemas.dependency import DependencyResponse
from backend.app.services.project_service import (
    get_project,
    get_projects,
    create_project,
    update_project,
    delete_project,
    to_project_response,
)
from backend.app.services.task_service import get_tasks, to_task_response
from backend.app.services.dependency_service import get_project_dependencies

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_new_project(
    project_in: ProjectCreate,
    db: Session = Depends(get_db)
):
    """Create a new industrial project."""
    project = create_project(db=db, project_in=project_in)
    return to_project_response(db=db, project=project)


@router.get("", response_model=List[ProjectResponse], status_code=status.HTTP_200_OK)
def list_projects(
    skip: int = Query(0, ge=0, description="Records to skip for pagination"),
    limit: int = Query(100, ge=1, le=500, description="Max records to return"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by project status"),
    search: Optional[str] = Query(None, description="Search term for project name or description"),
    db: Session = Depends(get_db)
):
    """Retrieve all projects with optional filtering, search, and pagination."""
    projects = get_projects(db=db, skip=skip, limit=limit, status=status_filter, search=search)
    return [to_project_response(db=db, project=p) for p in projects]


@router.get("/{project_id}", response_model=ProjectResponse, status_code=status.HTTP_200_OK)
def get_project_by_id(
    project_id: int,
    db: Session = Depends(get_db)
):
    """Get project details by project ID."""
    project = get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )
    return to_project_response(db=db, project=project)


@router.put("/{project_id}", response_model=ProjectResponse, status_code=status.HTTP_200_OK)
@router.patch("/{project_id}", response_model=ProjectResponse, status_code=status.HTTP_200_OK)
def update_project_by_id(
    project_id: int,
    project_in: ProjectUpdate,
    db: Session = Depends(get_db)
):
    """Update project details by project ID."""
    project = get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )
    try:
        updated = update_project(db=db, db_project=project, project_in=project_in)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    return to_project_response(db=db, project=updated)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_by_id(
    project_id: int,
    db: Session = Depends(get_db)
):
    """Delete a project and cascade remove its tasks and dependencies."""
    project = get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )
    delete_project(db=db, db_project=project)
    return None


@router.get("/{project_id}/tasks", response_model=List[TaskResponse], status_code=status.HTTP_200_OK)
def get_project_tasks(
    project_id: int,
    db: Session = Depends(get_db)
):
    """Retrieve all tasks belonging to a specific project."""
    project = get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )
    tasks = get_tasks(db=db, project_id=project_id)
    return [to_task_response(t) for t in tasks]


@router.get("/{project_id}/dependencies", response_model=List[DependencyResponse], status_code=status.HTTP_200_OK)
def get_project_dependencies_endpoint(
    project_id: int,
    db: Session = Depends(get_db)
):
    """Retrieve all dependencies for tasks within a specific project."""
    project = get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )
    return get_project_dependencies(db=db, project_id=project_id)
