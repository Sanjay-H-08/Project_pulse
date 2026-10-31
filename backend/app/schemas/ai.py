from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class AIChatRequest(BaseModel):
    message: str = Field(..., description="User question or prompt about the current project or any general project")
    project_id: Optional[int] = Field(None, description="Optional project ID to inject live project data context")
    context: Optional[Dict[str, Any]] = Field(None, description="Optional client context")


class AIChatResponse(BaseModel):
    reply: str = Field(..., description="AI response formatted in clear markdown")
    source: str = Field("expert_engine", description="Source of response: 'gemini' or 'expert_engine'")
    project_id: Optional[int] = Field(None, description="ID of project evaluated, if applicable")
    project_name: Optional[str] = Field(None, description="Name of project evaluated, if applicable")
    suggested_actions: List[str] = Field(default_factory=list, description="Follow-up prompt suggestions")
