from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.api.deps import get_db
from backend.app.schemas.task import TaskCreate, TaskUpdate, TaskResponse
from backend.app.schemas.dependency import DependencyCreate, DependencyCreateForTask, DependencyResponse
from backend.app.services.project_service import get_project
from backend.app.services.task_service import (
    get_task,
    get_tasks,
    create_task,
    update_task,
    delete_task,
    to_task_response,
)
from backend.app.services.dependency_service import (
    DependencyError,
    create_dependency,
    get_task_dependencies,
)

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_new_task(
    task_in: TaskCreate,
    db: Session = Depends(get_db)
):
    """Create a new task within an industrial project."""
    # Ensure referenced project exists
    project = get_project(db=db, project_id=task_in.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {task_in.project_id} not found"
        )

    # Pre-validate all initial dependencies if specified
    if task_in.depends_on_ids:
        for dep_id in task_in.depends_on_ids:
            prereq = get_task(db=db, task_id=dep_id)
            if not prereq:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Prerequisite task with id {dep_id} not found."
                )
            if prereq.project_id != task_in.project_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cross-project dependencies are not allowed. "
                           f"Task belongs to project {task_in.project_id}, "
                           f"while prerequisite task {dep_id} belongs to project {prereq.project_id}."
                )

    task = create_task(db=db, task_in=task_in)

    # Process initial dependencies
    if task_in.depends_on_ids:
        try:
            for dep_id in task_in.depends_on_ids:
                create_dependency(
                    db=db,
                    dep_in=DependencyCreate(
                        task_id=task.id,
                        depends_on_id=dep_id
                    )
                )
        except Exception as e:
            delete_task(db=db, db_task=task)
            if isinstance(e, DependencyError):
                raise HTTPException(status_code=e.status_code, detail=e.message)
            raise

    db.refresh(task)
    return to_task_response(task)


@router.get("", response_model=List[TaskResponse], status_code=status.HTTP_200_OK)
def list_tasks(
    project_id: Optional[int] = Query(None, description="Filter tasks by project ID"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by task status"),
    priority: Optional[str] = Query(None, description="Filter by task priority"),
    search: Optional[str] = Query(None, description="Search task name, description, or assignee"),
    skip: int = Query(0, ge=0, description="Records to skip for pagination"),
    limit: int = Query(100, ge=1, le=500, description="Max records to return"),
    db: Session = Depends(get_db)
):
    """Retrieve tasks with optional filtering by project, status, priority, search, and pagination."""
    tasks = get_tasks(
        db=db,
        project_id=project_id,
        status=status_filter,
        priority=priority,
        search=search,
        skip=skip,
        limit=limit
    )
    return [to_task_response(t) for t in tasks]


@router.get("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
def get_task_by_id(
    task_id: int,
    db: Session = Depends(get_db)
):
    """Get task details by task ID."""
    task = get_task(db=db, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID {task_id} not found"
        )
    return to_task_response(task)


@router.put("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
@router.patch("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
def update_task_by_id(
    task_id: int,
    task_in: TaskUpdate,
    db: Session = Depends(get_db)
):
    """Update task details by task ID."""
    task = get_task(db=db, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID {task_id} not found"
        )

    # If project_id is being changed, verify target project exists
    if task_in.project_id is not None and task_in.project_id != task.project_id:
        target_project = get_project(db=db, project_id=task_in.project_id)
        if not target_project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Target project with ID {task_in.project_id} not found"
            )
        # Check if task has active dependencies or dependents
        if task.dependencies or task.dependents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move task to another project while it has active dependencies"
            )

    try:
        updated = update_task(db=db, db_task=task, task_in=task_in)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    return to_task_response(updated)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_by_id(
    task_id: int,
    db: Session = Depends(get_db)
):
    """Delete a task and cascade remove its associated dependencies."""
    task = get_task(db=db, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID {task_id} not found"
        )
    delete_task(db=db, db_task=task)
    return None


@router.get("/{task_id}/dependencies", response_model=List[DependencyResponse], status_code=status.HTTP_200_OK)
def get_task_dependencies_endpoint(
    task_id: int,
    db: Session = Depends(get_db)
):
    """Get all dependencies where task_id is the dependent task."""
    task = get_task(db=db, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID {task_id} not found"
        )
    return get_task_dependencies(db=db, task_id=task_id)


@router.post("/{task_id}/dependencies", response_model=DependencyResponse, status_code=status.HTTP_201_CREATED)
def create_task_dependency_endpoint(
    task_id: int,
    dep_in: DependencyCreateForTask,
    db: Session = Depends(get_db)
):
    """Add a prerequisite dependency for the specified task."""
    full_dep_in = DependencyCreate(
        task_id=task_id,
        depends_on_id=dep_in.depends_on_id,
        dependency_type=dep_in.dependency_type,
        lag_days=dep_in.lag_days
    )
    try:
        return create_dependency(db=db, dep_in=full_dep_in)
    except DependencyError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
