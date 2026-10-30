from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import Integer, Float, Boolean, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from backend.app.database.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProjectSchedule(Base):
    __tablename__ = "project_schedules"
    __table_args__ = (
        UniqueConstraint("project_id", "use_pert", name="uq_project_schedule_project_pert"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    total_duration: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    critical_path: Mapped[List[int]] = mapped_column(JSON, nullable=False, default=list)
    critical_paths: Mapped[List[List[int]]] = mapped_column(JSON, nullable=False, default=list)
    critical_task_ids: Mapped[List[int]] = mapped_column(JSON, nullable=False, default=list)
    tasks_schedule: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    use_pert: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationship
    project: Mapped["Project"] = relationship("Project", back_populates="schedules")
