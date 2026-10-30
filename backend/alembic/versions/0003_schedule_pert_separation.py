"""Separate baseline and PERT schedules with compound unique constraint

Revision ID: 0003_schedule_pert_separation
Revises: 0002_scheduling_engine
Create Date: 2026-10-30 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003_schedule_pert_separation"
down_revision: Union[str, None] = "0002_scheduling_engine"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("project_schedules", schema=None) as batch_op:
        try:
            batch_op.drop_constraint("uq_project_schedule_project_id", type_="unique")
        except Exception:
            pass
        batch_op.create_unique_constraint(
            "uq_project_schedule_project_pert",
            ["project_id", "use_pert"]
        )


def downgrade() -> None:
    with op.batch_alter_table("project_schedules", schema=None) as batch_op:
        try:
            batch_op.drop_constraint("uq_project_schedule_project_pert", type_="unique")
        except Exception:
            pass
        batch_op.create_unique_constraint(
            "uq_project_schedule_project_id",
            ["project_id"]
        )
