from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from backend.app.api.deps import get_db, get_current_user
from backend.app.models.user import User
from backend.app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse
from backend.app.services.auth_service import (
    register_user,
    authenticate_user,
    create_access_token,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account"
)
def register(
    user_in: UserCreate,
    db: Session = Depends(get_db)
):
    """
    Register a new user with email, password (min 6 characters), and full name.
    Returns access token and user info immediately.
    """
    user = register_user(db=db, user_in=user_in)
    access_token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate and obtain access token"
)
def login(
    credentials: UserLogin,
    db: Session = Depends(get_db)
):
    """
    Authenticate an existing user with email and password.
    Returns access token and user profile on success.
    """
    user = authenticate_user(db=db, email=credentials.email, password=credentials.password)
    access_token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current authenticated user profile"
)
def get_me(
    current_user: User = Depends(get_current_user)
):
    """
    Protected endpoint: returns the authenticated user associated with Bearer token.
    """
    return UserResponse.model_validate(current_user)

