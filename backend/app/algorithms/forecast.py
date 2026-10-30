from dataclasses import dataclass
from typing import Dict, List, Tuple, Set, NamedTuple
from backend.app.algorithms.cpm import calculate_cpm, CPMScheduleResult, CPMSchedulingError


class ForecastEstimationError(ValueError):
    pass


def estimate_remaining_duration(duration: float, progress: int) -> float:
    """
    Estimates remaining duration for a task using deterministic earned progress:
    - If progress >= 100: remaining work = 0.0 days.
    - If progress <= 0: remaining work = baseline duration.
    - If 0 < progress < 100: remaining work = duration * ((100 - progress) / 100)
    """
    if duration < 0:
        raise ForecastEstimationError(f"Duration cannot be negative: {duration}")
    if progress < 0 or progress > 100:
        raise ForecastEstimationError(f"Progress must be between 0 and 100. Received: {progress}")

    if progress >= 100:
        return 0.0
    if progress <= 0:
        return float(duration)

    fraction_remaining = (100.0 - progress) / 100.0
    return round(float(duration) * fraction_remaining, 4)


@dataclass
class SimulatedTaskResult:
    task_id: int
    task_name: str
    original_duration: float
    simulated_duration: float
    original_early_start: float
    original_early_finish: float
    simulated_early_start: float
    simulated_early_finish: float
    start_delay: float
    finish_delay: float
    slack_consumed: float
    new_slack: float
    is_critical: bool


@dataclass
class SimulationAnalysisResult:
    baseline_duration: float
    simulated_duration: float
    project_delay: float
    critical_path_changed: bool
    original_critical_path: List[int]
    simulated_critical_path: List[int]
    simulated_critical_task_ids: List[int]
    affected_task_ids: List[int]
    task_results: List[SimulatedTaskResult]


def run_what_if_simulation(
    tasks: Dict[int, Tuple[str, float]],
    dependencies: List[Tuple[int, int]],
    hypothetical_delays: Dict[int, float],
    tolerance: float = 1e-5
) -> SimulationAnalysisResult:
    """
    Executes a read-only What-If delay simulation without modifying persistent state.

    Parameters:
    - tasks: dict mapping task_id -> (task_name, duration)
    - dependencies: list of (task_id, depends_on_id)
    - hypothetical_delays: dict mapping task_id -> additional delay days (>= 0)
    """
    for tid, delay in hypothetical_delays.items():
        if delay < 0:
            raise ForecastEstimationError(f"Delay cannot be negative for task {tid}: {delay}")
        if tid not in tasks:
            raise ForecastEstimationError(f"Task ID {tid} in simulation does not belong to project tasks")

    # 1. Compute baseline schedule
    base_cpm = calculate_cpm(tasks=tasks, dependencies=dependencies, tolerance=tolerance)

    # 2. Build simulated task durations
    simulated_tasks: Dict[int, Tuple[str, float]] = {}
    for tid, (name, dur) in tasks.items():
        add_delay = hypothetical_delays.get(tid, 0.0)
        simulated_tasks[tid] = (name, round(dur + add_delay, 4))

    # 3. Compute simulated schedule
    sim_cpm = calculate_cpm(tasks=simulated_tasks, dependencies=dependencies, tolerance=tolerance)

    # 4. Compare results
    project_delay = round(max(0.0, sim_cpm.total_duration - base_cpm.total_duration), 4)
    cp_changed = (base_cpm.critical_path != sim_cpm.critical_path)

    affected_ids: Set[int] = set()
    task_results: List[SimulatedTaskResult] = []

    for tid, (name, orig_dur) in sorted(tasks.items(), key=lambda x: x[0]):
        base_node = base_cpm.tasks[tid]
        sim_node = sim_cpm.tasks[tid]

        start_delay = round(max(0.0, sim_node.early_start - base_node.early_start), 4)
        finish_delay = round(max(0.0, sim_node.early_finish - base_node.early_finish), 4)
        slack_consumed = round(max(0.0, base_node.slack - sim_node.slack), 4)

        is_affected = (
            tid in hypothetical_delays or
            start_delay > tolerance or
            finish_delay > tolerance or
            slack_consumed > tolerance
        )
        if is_affected:
            affected_ids.add(tid)

        task_results.append(SimulatedTaskResult(
            task_id=tid,
            task_name=name,
            original_duration=orig_dur,
            simulated_duration=sim_node.duration,
            original_early_start=base_node.early_start,
            original_early_finish=base_node.early_finish,
            simulated_early_start=sim_node.early_start,
            simulated_early_finish=sim_node.early_finish,
            start_delay=start_delay,
            finish_delay=finish_delay,
            slack_consumed=slack_consumed,
            new_slack=sim_node.slack,
            is_critical=sim_node.is_critical
        ))

    return SimulationAnalysisResult(
        baseline_duration=base_cpm.total_duration,
        simulated_duration=sim_cpm.total_duration,
        project_delay=project_delay,
        critical_path_changed=cp_changed,
        original_critical_path=base_cpm.critical_path,
        simulated_critical_path=sim_cpm.critical_path,
        simulated_critical_task_ids=sim_cpm.critical_task_ids,
        affected_task_ids=sorted(affected_ids),
        task_results=task_results
    )
