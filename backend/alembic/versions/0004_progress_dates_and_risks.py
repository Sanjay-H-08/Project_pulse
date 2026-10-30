"""Add actual progress dates to tasks and create project_risks table

Revision ID: 0004_progress_dates_and_risks
Revises: 0003_schedule_pert_separation
Create Date: 2026-10-30 23:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004_progress_dates_and_risks"
down_revision: Union[str, None] = "0003_schedule_pert_separation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    task_columns = [c["name"] for c in inspector.get_columns("tasks")]

    # 1. Add actual dates to tasks
    with op.batch_alter_table("tasks", schema=None) as batch_op:
        if "actual_start_date" not in task_columns:
            batch_op.add_column(sa.Column("actual_start_date", sa.Date(), nullable=True))
        if "actual_end_date" not in task_columns:
            batch_op.add_column(sa.Column("actual_end_date", sa.Date(), nullable=True))

    # 2. Create project_risks table if it doesn't already exist
    if "project_risks" not in tables:
        op.create_table(
            "project_risks",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("task_id", sa.Integer(), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("likelihood", sa.Integer(), nullable=False),
            sa.Column("impact", sa.Integer(), nullable=False),
            sa.Column("score", sa.Integer(), nullable=False),
            sa.Column("category", sa.String(length=50), nullable=False),
            sa.Column("mitigation", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.CheckConstraint("likelihood >= 1 AND likelihood <= 5", name="ck_risk_likelihood_range"),
            sa.CheckConstraint("impact >= 1 AND impact <= 5", name="ck_risk_impact_range"),
            sa.CheckConstraint("score >= 1 AND score <= 25", name="ck_risk_score_range")
        )
        op.create_index(op.f("ix_project_risks_id"), "project_risks", ["id"], unique=False)
        op.create_index(op.f("ix_project_risks_project_id"), "project_risks", ["project_id"], unique=False)
        op.create_index(op.f("ix_project_risks_task_id"), "project_risks", ["task_id"], unique=False)
        op.create_index(op.f("ix_project_risks_title"), "project_risks", ["title"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    task_columns = [c["name"] for c in inspector.get_columns("tasks")]

    if "project_risks" in tables:
        op.drop_table("project_risks")

    with op.batch_alter_table("tasks", schema=None) as batch_op:
        if "actual_end_date" in task_columns:
            batch_op.drop_column("actual_end_date")
        if "actual_start_date" in task_columns:
            batch_op.drop_column("actual_start_date")
