from datetime import datetime, timezone, date
from typing import List, Optional
from sqlalchemy import Integer, Float, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column
from backend.app.database.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # PERT Three-point duration estimates (optional)
    optimistic_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    most_likely_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pessimistic_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Planned dates
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Actual progress tracking dates
    actual_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(50), nullable=False, default="To Do")
    priority: Mapped[str] = mapped_column(String(50), nullable=False, default="Medium")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assignee: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="tasks")

    # Dependencies where this task is dependent on another (incoming edges / prerequisites)
    dependencies: Mapped[List["TaskDependency"]] = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.task_id",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    # Dependencies where another task is waiting on this task (outgoing edges / successors)
    dependents: Mapped[List["TaskDependency"]] = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.depends_on_id",
        back_populates="depends_on_task",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    # Associated risks
    risks: Mapped[List["ProjectRisk"]] = relationship(
        "ProjectRisk",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
