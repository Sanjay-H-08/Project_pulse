from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    """Schema for registering a new user."""
    email: EmailStr = Field(..., description="Valid unique email address")
    password: str = Field(..., min_length=6, description="Password of at least 6 characters")
    full_name: str = Field(..., min_length=1, max_length=255, description="Full name of user")


class UserLogin(BaseModel):
    """Schema for user login credentials."""
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    """Public user profile response schema."""
    id: int
    email: str
    full_name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """JWT bearer token response schema."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
