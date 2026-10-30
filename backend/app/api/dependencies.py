from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.api.deps import get_db
from backend.app.schemas.dependency import DependencyCreate, DependencyResponse
from backend.app.services.dependency_service import (
    DependencyError,
    create_dependency,
    get_dependency,
    get_all_dependencies,
    delete_dependency,
)

router = APIRouter(prefix="/dependencies", tags=["Dependencies"])


@router.post("", response_model=DependencyResponse, status_code=status.HTTP_201_CREATED)
def create_new_dependency(
    dep_in: DependencyCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new dependency between two tasks.
    Validates:
    - Both tasks exist
    - Same project membership
    - No self dependencies
    - No duplicate dependencies
    - No circular dependencies
    """
    try:
        return create_dependency(db=db, dep_in=dep_in)
    except DependencyError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("", response_model=List[DependencyResponse], status_code=status.HTTP_200_OK)
def list_dependencies(
    project_id: Optional[int] = Query(None, description="Filter dependencies by project ID"),
    db: Session = Depends(get_db)
):
    """List dependencies with optional project filter."""
    return get_all_dependencies(db=db, project_id=project_id)


@router.get("/{dependency_id}", response_model=DependencyResponse, status_code=status.HTTP_200_OK)
def get_dependency_by_id(
    dependency_id: int,
    db: Session = Depends(get_db)
):
    """Get dependency by ID."""
    dep = get_dependency(db=db, dependency_id=dependency_id)
    if not dep:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dependency with ID {dependency_id} not found"
        )
    return dep


@router.delete("/{dependency_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_dependency_by_id(
    dependency_id: int,
    db: Session = Depends(get_db)
):
    """Remove a task dependency."""
    dep = get_dependency(db=db, dependency_id=dependency_id)
    if not dep:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dependency with ID {dependency_id} not found"
        )
    delete_dependency(db=db, db_dep=dep)
    return None
