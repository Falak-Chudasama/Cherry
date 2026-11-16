"""
Cherry Server Startup Script.
Runs the FastAPI server locally at 127.0.0.7:10000 (reverse proxied via Nginx at api.cherry.jam).
"""
import sys
import argparse
from pathlib import Path
import uvicorn

# Ensure server root is on sys.path
SERVER_ROOT = Path(__file__).resolve().parent
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from app.core.config import settings


def main():
    parser = argparse.ArgumentParser(description="Cherry Backend API Server")
    parser.add_argument("--host", default=settings.HOST, help="Binding host IP (default: 127.0.0.7)")
    parser.add_argument("--port", type=int, default=settings.PORT, help="Port (default: 10000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    args = parser.parse_args()

    print(f"Starting Cherry Backend on http://{args.host}:{args.port}")
    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
