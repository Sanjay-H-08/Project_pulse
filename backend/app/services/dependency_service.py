from collections import deque
from typing import List, Optional, Tuple, Set, Dict
from sqlalchemy.orm import Session
from backend.app.models.task import Task
from backend.app.models.dependency import TaskDependency
from backend.app.schemas.dependency import DependencyCreate
from backend.app.services.scheduling_service import invalidate_project_schedule


class DependencyError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def get_dependency(db: Session, dependency_id: int) -> Optional[TaskDependency]:
    return db.query(TaskDependency).filter(TaskDependency.id == dependency_id).first()


def get_task_dependencies(db: Session, task_id: int) -> List[TaskDependency]:
    """Returns all dependencies where task_id is the dependent task (prerequisites)."""
    return db.query(TaskDependency).filter(TaskDependency.task_id == task_id).all()


def get_project_dependencies(db: Session, project_id: int) -> List[TaskDependency]:
    """Returns all dependencies for a given project."""
    return db.query(TaskDependency).filter(TaskDependency.project_id == project_id).all()


def get_all_dependencies(db: Session, project_id: Optional[int] = None) -> List[TaskDependency]:
    query = db.query(TaskDependency)
    if project_id is not None:
        query = query.filter(TaskDependency.project_id == project_id)
    return query.order_by(TaskDependency.id.asc()).all()


def _build_precedence_graph(dependencies: List[TaskDependency]) -> Dict[int, List[int]]:
    """
    Builds precedence adjacency list:
    edge u -> v means task u precedes task v (task v depends on task u).
    """
    graph: Dict[int, List[int]] = {}
    for dep in dependencies:
        predecessor = dep.depends_on_id
        successor = dep.task_id
        if predecessor not in graph:
            graph[predecessor] = []
        graph[predecessor].append(successor)
    return graph


def _find_path(graph: Dict[int, List[int]], start: int, target: int) -> Optional[List[int]]:
    """
    Finds a directed path from start to target if one exists.
    Returns the list of task IDs along the path, or None.
    """
    if start == target:
        return [start]

    queue: deque[Tuple[int, List[int]]] = deque([(start, [start])])
    visited: Set[int] = {start}

    while queue:
        current, path = queue.popleft()
        for neighbor in graph.get(current, []):
            if neighbor == target:
                return path + [neighbor]
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor]))
    return None


def create_dependency(db: Session, dep_in: DependencyCreate) -> TaskDependency:
    task_id = dep_in.task_id
    depends_on_id = dep_in.depends_on_id

    # 1. Self-dependency check
    if task_id == depends_on_id:
        raise DependencyError("A task cannot depend on itself.", status_code=400)

    # 2. Verify both tasks exist
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise DependencyError(f"Task with id {task_id} not found.", status_code=404)

    prerequisite_task = db.query(Task).filter(Task.id == depends_on_id).first()
    if not prerequisite_task:
        raise DependencyError(f"Prerequisite task with id {depends_on_id} not found.", status_code=404)

    # 3. Verify tasks belong to the same project
    if task.project_id != prerequisite_task.project_id:
        raise DependencyError(
            f"Cross-project dependencies are not allowed. "
            f"Task {task_id} belongs to project {task.project_id}, "
            f"while prerequisite task {depends_on_id} belongs to project {prerequisite_task.project_id}.",
            status_code=400
        )

    project_id = task.project_id

    # 4. Check for duplicate dependency
    existing = db.query(TaskDependency).filter(
        TaskDependency.task_id == task_id,
        TaskDependency.depends_on_id == depends_on_id
    ).first()
    if existing:
        raise DependencyError(
            f"Dependency already exists: Task {task_id} already depends on Task {depends_on_id}.",
            status_code=409
        )

    # 5. Check for circular dependency
    # In the precedence graph, prerequisite precedes task (depends_on_id -> task_id).
    # If a path already exists from task_id to depends_on_id, adding depends_on_id -> task_id creates a cycle.
    existing_deps = get_project_dependencies(db, project_id=project_id)
    graph = _build_precedence_graph(existing_deps)

    path = _find_path(graph, start=task_id, target=depends_on_id)
    if path:
        path_str = " -> ".join(str(tid) for tid in path)
        raise DependencyError(
            f"Circular dependency detected. Path already exists: {path_str}. "
            f"Making task {task_id} depend on task {depends_on_id} would create a cycle ({path_str} -> {task_id}).",
            status_code=400
        )

    # Create new dependency
    db_dep = TaskDependency(
        project_id=project_id,
        task_id=task_id,
        depends_on_id=depends_on_id,
        dependency_type=dep_in.dependency_type or "finish_to_start",
        lag_days=dep_in.lag_days or 0
    )
    db.add(db_dep)
    db.commit()
    db.refresh(db_dep)

    # Invalidate cached schedule for project
    invalidate_project_schedule(db, project_id)
    return db_dep


def delete_dependency(db: Session, db_dep: TaskDependency) -> None:
    project_id = db_dep.project_id
    db.delete(db_dep)
    db.commit()

    # Invalidate cached schedule for project
    invalidate_project_schedule(db, project_id)
