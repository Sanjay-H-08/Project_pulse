from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Dict, List, Set, Optional, Tuple


class CPMSchedulingError(ValueError):
    """Raised when CPM calculation encounters an unrecoverable graph error (e.g., cycle)."""
    pass


@dataclass
class TaskScheduleNode:
    task_id: int
    name: str
    duration: float
    early_start: float = 0.0
    early_finish: float = 0.0
    late_start: float = 0.0
    late_finish: float = 0.0
    slack: float = 0.0
    is_critical: bool = False
    predecessors: List[int] = field(default_factory=list)
    successors: List[int] = field(default_factory=list)


@dataclass
class CPMScheduleResult:
    total_duration: float
    tasks: Dict[int, TaskScheduleNode]
    critical_path: List[int]
    critical_paths: List[List[int]]
    critical_task_ids: List[int]


def _detect_cycle(
    task_ids: List[int],
    successors_map: Dict[int, List[int]],
    in_degrees: Dict[int, int]
) -> List[int]:
    """
    Attempts to identify nodes involved in a cycle for diagnostic error reporting.
    """
    remaining = set(task_ids)
    q = deque([tid for tid in task_ids if in_degrees[tid] == 0])
    while q:
        curr = q.popleft()
        remaining.remove(curr)
        for succ in successors_map[curr]:
            in_degrees[succ] -= 1
            if in_degrees[succ] == 0:
                q.append(succ)
    return list(remaining)


def calculate_cpm(
    tasks: Dict[int, Tuple[str, float]],
    dependencies: List[Tuple[int, int]],
    tolerance: float = 1e-5
) -> CPMScheduleResult:
    """
    Executes standard Critical Path Method (CPM) calculation:
    - Forward pass: Early Start (ES) and Early Finish (EF)
    - Backward pass: Late Start (LS) and Late Finish (LF)
    - Total Float / Slack: LS - ES
    - Critical Task identification: slack <= tolerance
    - Critical Path determination: all paths of critical tasks from start to finish

    Parameters:
    - tasks: dict mapping task_id -> (task_name, duration)
    - dependencies: list of tuples (task_id, depends_on_id) representing:
      task_id depends on depends_on_id (depends_on_id -> task_id).
    - tolerance: floating point comparison tolerance for zero slack.

    Returns:
    - CPMScheduleResult
    """
    # Handle empty project edge case
    if not tasks:
        return CPMScheduleResult(
            total_duration=0.0,
            tasks={},
            critical_path=[],
            critical_paths=[],
            critical_task_ids=[]
        )

    # Initialize graph structures
    nodes: Dict[int, TaskScheduleNode] = {}
    predecessors_map: Dict[int, List[int]] = defaultdict(list)
    successors_map: Dict[int, List[int]] = defaultdict(list)
    in_degree: Dict[int, int] = {tid: 0 for tid in tasks}

    for tid, (name, dur) in tasks.items():
        if dur < 0:
            raise CPMSchedulingError(f"Task {tid} ('{name}') has invalid negative duration: {dur}")
        nodes[tid] = TaskScheduleNode(task_id=tid, name=name, duration=float(dur))

    # Build dependency edges
    for task_id, depends_on_id in dependencies:
        if task_id not in tasks:
            raise CPMSchedulingError(f"Dependency references unknown task_id: {task_id}")
        if depends_on_id not in tasks:
            raise CPMSchedulingError(f"Dependency references unknown predecessor depends_on_id: {depends_on_id}")
        if task_id == depends_on_id:
            raise CPMSchedulingError(f"Self-dependency detected for task {task_id}")

        predecessors_map[task_id].append(depends_on_id)
        successors_map[depends_on_id].append(task_id)
        in_degree[task_id] += 1

    # Populate node predecessors/successors
    for tid, node in nodes.items():
        node.predecessors = sorted(predecessors_map[tid])
        node.successors = sorted(successors_map[tid])

    # 1. Topological Sort via Kahn's Algorithm
    topo_order: List[int] = []
    zero_in_degree_queue = deque([tid for tid in tasks if in_degree[tid] == 0])
    in_deg_copy = dict(in_degree)

    while zero_in_degree_queue:
        curr = zero_in_degree_queue.popleft()
        topo_order.append(curr)
        for succ in successors_map[curr]:
            in_deg_copy[succ] -= 1
            if in_deg_copy[succ] == 0:
                zero_in_degree_queue.append(succ)

    # Check for circular dependency
    if len(topo_order) < len(tasks):
        cyclic_nodes = _detect_cycle(list(tasks.keys()), successors_map, in_degree)
        raise CPMSchedulingError(
            f"Circular dependency detected in project schedule involving task IDs: {sorted(cyclic_nodes)}"
        )

    # 2. Forward Pass: Earliest Start (ES) and Earliest Finish (EF)
    for tid in topo_order:
        node = nodes[tid]
        if not node.predecessors:
            node.early_start = 0.0
        else:
            node.early_start = max(nodes[pred_id].early_finish for pred_id in node.predecessors)
        node.early_finish = round(node.early_start + node.duration, 4)

    # Total project duration is the maximum EF among all tasks
    project_duration = max(node.early_finish for node in nodes.values()) if nodes else 0.0
    project_duration = round(project_duration, 4)

    # 3. Backward Pass: Latest Finish (LF) and Latest Start (LS)
    for tid in reversed(topo_order):
        node = nodes[tid]
        if not node.successors:
            node.late_finish = project_duration
        else:
            node.late_finish = min(nodes[succ_id].late_start for succ_id in node.successors)
        node.late_start = round(node.late_finish - node.duration, 4)

    # 4. Total Float / Slack & Critical Task Identification
    critical_task_ids: List[int] = []
    for tid, node in nodes.items():
        node.slack = round(node.late_start - node.early_start, 4)
        # Avoid negative floating point zero (-0.0)
        if abs(node.slack) <= tolerance:
            node.slack = 0.0
            node.is_critical = True
            critical_task_ids.append(tid)
        else:
            node.is_critical = False

    critical_task_ids.sort()

    # 5. Critical Path(s) Extraction
    # Trace paths starting at tasks with ES == 0 that are critical, following critical edges
    critical_paths = _find_all_critical_paths(nodes, project_duration, tolerance)
    primary_critical_path = critical_paths[0] if critical_paths else []

    return CPMScheduleResult(
        total_duration=project_duration,
        tasks=nodes,
        critical_path=primary_critical_path,
        critical_paths=critical_paths,
        critical_task_ids=critical_task_ids
    )


def _find_all_critical_paths(
    nodes: Dict[int, TaskScheduleNode],
    project_duration: float,
    tolerance: float
) -> List[List[int]]:
    """
    Finds all valid critical paths from start to finish.
    A valid critical path consists entirely of critical tasks starting at ES == 0
    and ending at EF == project_duration, where EF(u) == ES(v) along each edge.
    """
    if not nodes or project_duration == 0.0:
        return []

    # Identify candidate start nodes (critical nodes with no critical predecessors, or ES == 0)
    start_nodes = [
        tid for tid, node in nodes.items()
        if node.is_critical and abs(node.early_start) <= tolerance and (
            not node.predecessors or all(not nodes[p].is_critical for p in node.predecessors)
        )
    ]

    all_paths: List[List[int]] = []

    def dfs(curr_id: int, current_path: List[int]):
        curr_node = nodes[curr_id]

        # Check if curr_node is an end node on the critical path
        is_end_node = abs(curr_node.early_finish - project_duration) <= tolerance
        has_critical_successor = False

        for succ_id in curr_node.successors:
            succ_node = nodes[succ_id]
            # Valid critical transition: successor is critical and starts when current finishes
            if succ_node.is_critical and abs(succ_node.early_start - curr_node.early_finish) <= tolerance:
                has_critical_successor = True
                dfs(succ_id, current_path + [succ_id])

        if is_end_node and not has_critical_successor:
            all_paths.append(current_path)

    for start_id in start_nodes:
        dfs(start_id, [start_id])

    # If no connected paths found (e.g. single critical task or isolated), collect critical task IDs
    if not all_paths:
        isolated_critical = [
            [tid] for tid, node in nodes.items()
            if node.is_critical and abs(node.early_finish - project_duration) <= tolerance
        ]
        return isolated_critical

    # Sort paths for deterministic output
    all_paths.sort(key=lambda p: (len(p), p))
    return all_paths
