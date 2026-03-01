from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.database import engine, Base
from app.middleware.security import SecurityHeadersMiddleware, limiter
from app.routers import auth, workbooks, sheets, cells, ai, ws, files
import app.models  # noqa: F401 — ensure all models are registered with Base

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (use Alembic in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="Nexus Grid API",
    description="Backend API for Nexus Grid — AI-powered spreadsheet",
    version="0.1.0",
    lifespan=lifespan,
    # Hide detailed error info in production
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
)

# ── Rate limiter ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Security headers ──────────────────────────────────────────────────────────
app.add_middleware(SecurityHeadersMiddleware, is_production=settings.is_production)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(workbooks.router, prefix="/api/v1")
app.include_router(sheets.router, prefix="/api/v1")
app.include_router(cells.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(ws.router)  # WebSocket — no /api/v1 prefix


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
