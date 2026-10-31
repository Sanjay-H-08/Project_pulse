import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

import jwt
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.user import User
from backend.app.schemas.user import UserCreate


def hash_password(password: str) -> str:
    """Hash password using PBKDF2 HMAC SHA-256 with random salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000
    )
    return f"pbkdf2_sha256${salt}${key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against stored PBKDF2 hash."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 3 or parts[0] != "pbkdf2_sha256":
            return False
        salt = parts[1]
        expected_hash = parts[2]
        key = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt.encode("utf-8"),
            100_000
        )
        return hmac.compare_digest(key.hex(), expected_hash)
    except Exception:
        return False


def create_access_token(user_id: int, email: str, expires_delta: Optional[timedelta] = None) -> str:
    """Generate signed JWT access token."""
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate JWT access token."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Retrieve user by normalized lowercase email."""
    return db.query(User).filter(User.email == email.strip().lower()).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Retrieve user by ID."""
    return db.query(User).filter(User.id == user_id).first()


def register_user(db: Session, user_in: UserCreate) -> User:
    """Register a new user after verifying uniqueness."""
    clean_email = user_in.email.strip().lower()
    existing = get_user_by_email(db, clean_email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is already registered."
        )

    user = User(
        email=clean_email,
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name.strip()
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    """Verify user credentials and return User object."""
    clean_email = email.strip().lower()
    user = get_user_by_email(db, clean_email)
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return user

