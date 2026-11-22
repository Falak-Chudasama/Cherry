"""
Cherry Main Application Entrypoint.
FastAPI application for Cherry, bound to 127.0.0.7:10000.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import db_manager
from app.adapters.basket_adapter import basket_adapter
from app.adapters.lemon_adapter import lemon_adapter
from app.services.lifecycle_service import lifecycle_service
from app.routes import (
    system,
    calendar,
    tasks,
    plans,
    focus,
    accountability,
    feedback,
    notes,
    commands,
    lemon,
    chat,
    lifecycle,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("cherry")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info("Initializing Cherry Backend on %s:%s...", settings.HOST, settings.PORT)
    db_manager.connect()
    await db_manager.init_indexes()

    # Run Startup Reconciliation & Chronological Catch-Up
    try:
        await lifecycle_service.reconcile_on_startup()
    except Exception as exc:
        logger.error("Startup lifecycle reconciliation encountered an issue: %s", exc, exc_info=True)

    # Launch Live 23:00 / 00:00 Background Scheduler Loop (ticks every 30s)
    scheduler_task = asyncio.create_task(lifecycle_service.start_scheduler_loop())

    yield

    # --- Shutdown ---
    logger.info("Shutting down Cherry Backend...")
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.warning("Scheduler task cancelled with error: %s", e)

    await basket_adapter.close()
    await lemon_adapter.close()
    db_manager.close()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan,
)

# CORS Policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Domain Routers
app.include_router(system.router)
app.include_router(calendar.router)
app.include_router(tasks.router)
app.include_router(plans.router)
app.include_router(focus.router)
app.include_router(accountability.router)
app.include_router(feedback.router)
app.include_router(notes.router)
app.include_router(commands.router)
app.include_router(lemon.router)
app.include_router(chat.router)
app.include_router(lifecycle.router)


@app.get("/")
def hello_cherry():
    return {
        "message": "Hello from Cherry 🍒",
        "app": settings.app_name,
        "version": settings.version,
        "primary_interface": "conversational",
        "status": "online",
    }
