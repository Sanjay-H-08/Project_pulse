from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from backend.app.database.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProjectRisk(Base):
    __tablename__ = "project_risks"
    __table_args__ = (
        CheckConstraint("likelihood >= 1 AND likelihood <= 5", name="ck_risk_likelihood_range"),
        CheckConstraint("impact >= 1 AND impact <= 5", name="ck_risk_impact_range"),
        CheckConstraint("score >= 1 AND score <= 25", name="ck_risk_score_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    task_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    likelihood: Mapped[int] = mapped_column(Integer, nullable=False)
    impact: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    mitigation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="risks")
    task: Mapped[Optional["Task"]] = relationship("Task", back_populates="risks")
