"""Add PERT fields to tasks and project_schedules table

Revision ID: 0002_scheduling_engine
Revises: 0001_initial_schema
Create Date: 2026-10-30 23:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002_scheduling_engine"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    task_columns = [c["name"] for c in inspector.get_columns("tasks")]

    # 1. Add PERT fields to tasks if they don't already exist
    with op.batch_alter_table("tasks", schema=None) as batch_op:
        if "optimistic_duration" not in task_columns:
            batch_op.add_column(sa.Column("optimistic_duration", sa.Float(), nullable=True))
        if "most_likely_duration" not in task_columns:
            batch_op.add_column(sa.Column("most_likely_duration", sa.Float(), nullable=True))
        if "pessimistic_duration" not in task_columns:
            batch_op.add_column(sa.Column("pessimistic_duration", sa.Float(), nullable=True))

    # 2. Create project_schedules table if it doesn't already exist
    if "project_schedules" not in tables:
        op.create_table(
            "project_schedules",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("total_duration", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("critical_path", sa.JSON(), nullable=False),
            sa.Column("critical_paths", sa.JSON(), nullable=False),
            sa.Column("critical_task_ids", sa.JSON(), nullable=False),
            sa.Column("tasks_schedule", sa.JSON(), nullable=False),
            sa.Column("use_pert", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("project_id", name="uq_project_schedule_project_id")
        )
        op.create_index(op.f("ix_project_schedules_id"), "project_schedules", ["id"], unique=False)
        op.create_index(op.f("ix_project_schedules_project_id"), "project_schedules", ["project_id"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    task_columns = [c["name"] for c in inspector.get_columns("tasks")]

    if "project_schedules" in tables:
        op.drop_table("project_schedules")

    with op.batch_alter_table("tasks", schema=None) as batch_op:
        if "pessimistic_duration" in task_columns:
            batch_op.drop_column("pessimistic_duration")
        if "most_likely_duration" in task_columns:
            batch_op.drop_column("most_likely_duration")
        if "optimistic_duration" in task_columns:
            batch_op.drop_column("optimistic_duration")
