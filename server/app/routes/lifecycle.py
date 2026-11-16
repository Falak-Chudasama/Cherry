"""
Lifecycle and Downtime Catch-Up inspection routes.
"""
from fastapi import APIRouter
from app.services.lifecycle_service import lifecycle_service

router = APIRouter(prefix="/api/lifecycle", tags=["Lifecycle"])


@router.post("/reconcile")
async def trigger_reconciliation():
    """Trigger manual lifecycle reconciliation sweep."""
    results = await lifecycle_service.reconcile_on_startup()
    return {"success": True, "results": results}


@router.get("/jobs")
async def list_lifecycle_jobs(limit: int = 50):
    cursor = lifecycle_service.db.lifecycle_jobs.find().sort("scheduled_at", -1).limit(limit)
    jobs = [doc async for doc in cursor]
    # Remove MongoDB internal ObjectId for JSON serialization
    for j in jobs:
        if "_id" in j:
            del j["_id"]
    return jobs
