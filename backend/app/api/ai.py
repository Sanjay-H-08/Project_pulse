from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from backend.app.api.deps import get_db
from backend.app.schemas.ai import AIChatRequest, AIChatResponse
from backend.app.services.ai_service import ask_ai_assistant

router = APIRouter(prefix="/ai", tags=["AI Project Assistant"])


@router.post("/chat", response_model=AIChatResponse, status_code=status.HTTP_200_OK)
def ai_chat_endpoint(
    payload: AIChatRequest,
    db: Session = Depends(get_db)
):
    """
    Intelligent AI Assistant Endpoint:
    Provides context-aware solutions for the current project as well as
    expert solutions for ANY project in general (methodologies, WBS, formulas, risks).
    """
    return ask_ai_assistant(
        db=db,
        message=payload.message,
        project_id=payload.project_id
    )


@router.get("/prompts", response_model=List[str], status_code=status.HTTP_200_OK)
def get_suggested_prompts():
    """
    Returns suggested prompts covering both the current active project
    and universal project planning/risk scenarios.
    """
    return [
        "Identify Critical Path (CPM)",
        "PERT duration & on-time probability",
        "Predict project delays & bottlenecks",
        "Who has the heaviest workload?",
        "Show project risks & health index",
        "How to plan an enterprise web project?",
        "How to crash a schedule with minimum cost?",
        "How to handle unexpected scope creep?",
        "Explain Total Float vs Free Float"
    ]
