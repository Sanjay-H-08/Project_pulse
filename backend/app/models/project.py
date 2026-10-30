from datetime import datetime, timezone, date
from typing import List, Optional
from sqlalchemy import Integer, String, Text, Date, DateTime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from backend.app.database.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Planned")
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    team_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    tasks: Mapped[List["Task"]] = relationship(
        "Task",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Task.id"
    )
    dependencies: Mapped[List["TaskDependency"]] = relationship(
        "TaskDependency",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    schedules: Mapped[List["ProjectSchedule"]] = relationship(
        "ProjectSchedule",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    risks: Mapped[List["ProjectRisk"]] = relationship(
        "ProjectRisk",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
