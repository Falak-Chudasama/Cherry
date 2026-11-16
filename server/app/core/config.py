"""
Cherry Configuration Module.
Defines all environment, port, ecosystem, and domain constants.
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Cherry"
    version: str = "1.0.0"
    debug: bool = False

    # Network Bindings (Fruits.md: 127.0.0.7:10000)
    HOST: str = "127.0.0.7"
    PORT: int = 10000

    # MongoDB (Fruit namespace: cherry)
    MONGO_URI: str = "mongodb://127.0.0.1:10000/cherry"
    DATABASE_NAME: str = "cherry"

    # Ecosystem Integrations
    BASKET_API_URL: str = "http://127.0.0.1:10010"
    LEMON_API_URL: str = "http://127.0.0.6:10000/api/v1"

    # Timezone & Lifecycle
    TIMEZONE: str = "Asia/Kolkata"
    CLOSURE_HOUR: int = 23  # Default 23:00 (11 PM)
    CHECKIN_HOUR: int = 22  # Default 22:00 (10 PM)

    # Core Accountability Constants (Prompt Section 6)
    JUNK_POINT_LIMIT: int = 50
    QUARTER_KEYS_INITIAL: int = 3
    DURATION_SETTING: int = 30  # Preserved as configurable 30 seconds

    # Focus & Pomodoro Defaults
    FOCUS_DURATION_MINUTES: int = 60
    BREAK_DURATION_MINUTES: int = 10

    # CORS
    cors_origins: List[str] = [
        "http://cherry.jam",
        "https://cherry.jam",
        "http://api.cherry.jam",
        "https://api.cherry.jam",
        "http://127.0.0.7:10000",
        "http://127.0.0.7:5070",
        "http://127.0.0.7:5173",
        "http://127.0.0.1:10000",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://localhost:5070",
        "http://localhost:10000",
        "http://localhost:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
