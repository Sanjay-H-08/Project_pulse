"""
Area C Audit: Critical Path Method (CPM) Analytical Edge Cases.
"""
from backend.app.algorithms.cpm import calculate_cpm, CPMSchedulingError


def test_cpm_single_task_project():
    """Single isolated task project has duration = task duration and slack = 0."""
    res = calculate_cpm(tasks={101: ("Site Survey", 7.0)}, dependencies=[])
    assert res.total_duration == 7.0
    assert res.critical_task_ids == [101]
    assert res.critical_path == [101]
    node = res.tasks[101]
    assert node.early_start == 0.0
    assert node.early_finish == 7.0
    assert node.late_start == 0.0
    assert node.late_finish == 7.0
    assert node.slack == 0.0
    assert node.is_critical is True


def test_cpm_industrial_complex_network_analytical():
    """
    Independently verified industrial network:
    T1 (4d) -> T2 (6d) -> T3 (8d) -> T5 (10d) -> T7 (4d) -> T8 (2d) [Critical: 34d]
    Branch: T2 (6d) -> T4 (3d) -> T6 (5d) -> T7 (4d) [Path: 24d, Slack: 10d]
    """
    tasks = {
        1: ("Site Preparation", 4.0),
        2: ("Civil Foundation", 6.0),
        3: ("Structural Steelwork", 8.0),
        4: ("Electrical Conduit", 3.0),
        5: ("Machinery Rigging", 10.0),
        6: ("Main Switchboard", 5.0),
        7: ("Machine Connections", 4.0),
        8: ("Commissioning", 2.0),
    }
    dependencies = [
        (2, 1),  # T2 depends on T1
        (3, 2),  # T3 depends on T2
        (4, 2),  # T4 depends on T2
        (5, 3),  # T5 depends on T3
        (6, 4),  # T6 depends on T4
        (7, 5),  # T7 depends on T5
        (7, 6),  # T7 depends on T6
        (8, 7),  # T8 depends on T7
    ]

    res = calculate_cpm(tasks=tasks, dependencies=dependencies)

    assert res.total_duration == 34.0
    assert res.critical_task_ids == [1, 2, 3, 5, 7, 8]
    assert res.critical_path == [1, 2, 3, 5, 7, 8]

    # Verify analytical node properties
    n1 = res.tasks[1]
    assert (n1.early_start, n1.early_finish, n1.late_start, n1.late_finish, n1.slack) == (0.0, 4.0, 0.0, 4.0, 0.0)

    n2 = res.tasks[2]
    assert (n2.early_start, n2.early_finish, n2.late_start, n2.late_finish, n2.slack) == (4.0, 10.0, 4.0, 10.0, 0.0)

    n3 = res.tasks[3]
    assert (n3.early_start, n3.early_finish, n3.late_start, n3.late_finish, n3.slack) == (10.0, 18.0, 10.0, 18.0, 0.0)

    # Non-critical T4
    n4 = res.tasks[4]
    assert (n4.early_start, n4.early_finish, n4.late_start, n4.late_finish, n4.slack) == (10.0, 13.0, 20.0, 23.0, 10.0)
    assert n4.is_critical is False

    n5 = res.tasks[5]
    assert (n5.early_start, n5.early_finish, n5.late_start, n5.late_finish, n5.slack) == (18.0, 28.0, 18.0, 28.0, 0.0)

    # Non-critical T6
    n6 = res.tasks[6]
    assert (n6.early_start, n6.early_finish, n6.late_start, n6.late_finish, n6.slack) == (13.0, 18.0, 23.0, 28.0, 10.0)
    assert n6.is_critical is False

    n7 = res.tasks[7]
    assert (n7.early_start, n7.early_finish, n7.late_start, n7.late_finish, n7.slack) == (28.0, 32.0, 28.0, 32.0, 0.0)

    n8 = res.tasks[8]
    assert (n8.early_start, n8.early_finish, n8.late_start, n8.late_finish, n8.slack) == (32.0, 34.0, 32.0, 34.0, 0.0)


def test_cpm_multiple_critical_paths_analytical():
    """
    Two equal length parallel branches create multiple critical paths:
    Start -> Branch 1 (dur 10) -> Finish
    Start -> Branch 2 (dur 10) -> Finish
    Both paths must be detected.
    """
    tasks = {
        1: ("Start", 2.0),
        2: ("Branch A", 10.0),
        3: ("Branch B", 10.0),
        4: ("Finish", 3.0),
    }
    dependencies = [
        (2, 1),
        (3, 1),
        (4, 2),
        (4, 3),
    ]

    res = calculate_cpm(tasks=tasks, dependencies=dependencies)
    assert res.total_duration == 15.0
    assert set(res.critical_task_ids) == {1, 2, 3, 4}
    assert len(res.critical_paths) == 2
    assert [1, 2, 4] in res.critical_paths
    assert [1, 3, 4] in res.critical_paths


def test_cpm_cycle_raises_explicit_exception():
    """Passing a cyclic dependency graph to calculate_cpm raises CPMSchedulingError."""
    import pytest
    with pytest.raises(CPMSchedulingError) as exc_info:
        calculate_cpm(
            tasks={1: ("T1", 5.0), 2: ("T2", 5.0)},
            dependencies=[(2, 1), (1, 2)]
        )
    assert "circular dependency" in str(exc_info.value).lower()
