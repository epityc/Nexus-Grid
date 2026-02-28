from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.security import limiter
from app.schemas.user import UserCreate, UserRead, Token, TokenRefresh, LoginRequest
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, payload: UserCreate, db: AsyncSession = Depends(get_db)):
    if await auth_service.get_user_by_email(db, payload.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if await auth_service.get_user_by_username(db, payload.username):
        raise HTTPException(status_code=400, detail="Username already taken")
    user = await auth_service.create_user(db, payload)
    return user


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await auth_service.authenticate_user(db, payload.email, payload.password)
    if not user:
        # Generic message — prevents user enumeration via error distinguishing
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return Token(
        access_token=auth_service.create_access_token(str(user.id)),
        refresh_token=auth_service.create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=Token)
@limiter.limit("20/minute")
async def refresh(request: Request, payload: TokenRefresh, db: AsyncSession = Depends(get_db)):
    try:
        data = auth_service.decode_token(payload.refresh_token)
        if data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await auth_service.get_user_by_id(db, uuid.UUID(data["sub"]))
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    return Token(
        access_token=auth_service.create_access_token(str(user.id)),
        refresh_token=auth_service.create_refresh_token(str(user.id)),
    )
