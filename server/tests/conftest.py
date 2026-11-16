"""
Pytest configuration for Cherry Backend.
Uses dedicated 'cherry_test' MongoDB database for high-fidelity test runs.
"""
import pytest
from app.core.config import settings
from app.core.database import db_manager

# Redirect test database
settings.DATABASE_NAME = "cherry_test"
settings.MONGO_URI = "mongodb://127.0.0.1:10000/cherry_test"


@pytest.fixture(autouse=True)
async def clean_test_db():
    """Clean all test collections before and after each test."""
    db = db_manager.db
    collections = await db.list_collection_names()
    for col in collections:
        if not col.startswith("system."):
            await db[col].delete_many({})
    yield
