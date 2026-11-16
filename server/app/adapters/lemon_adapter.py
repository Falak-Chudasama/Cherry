"""
Lemon Desktop API Adapter for Cherry.
Handles DNS protection toggles, Quarantine operations, and ephemeral Activity Intelligence retrieval.
Respects Lemon's data ownership: raw activity payloads are discarded after computing derived metrics.
"""
import logging
from typing import Dict, Any, Optional, List
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


class LemonAdapter:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.LEMON_API_URL).rstrip("/")
        self.client = httpx.AsyncClient(timeout=8.0)

    async def is_available(self) -> bool:
        """Check if Lemon Desktop daemon is responding."""
        try:
            r = await self.client.get(f"{self.base_url}/system/health", timeout=2.0)
            return r.status_code == 200
        except Exception:
            return False

    # --- DNS & Focus Mode Integration ---

    async def get_dns_status(self) -> Dict[str, Any]:
        """Query Lemon's real-time DNS resolver protection state."""
        try:
            r = await self.client.get(f"{self.base_url}/dns/status", timeout=3.0)
            if r.status_code == 200:
                return r.json()
        except Exception as e:
            logger.debug(f"Lemon DNS status check failed: {e}")
        return {
            "dns_enabled": False,
            "effective_protection_active": False,
            "error": "LEMON_UNAVAILABLE",
        }

    async def enable_dns(self) -> Dict[str, Any]:
        """
        Activate Lemon DNS restrictions when Focus Mode turns ON.
        Idempotent operation on Lemon.
        """
        try:
            r = await self.client.post(f"{self.base_url}/dns/enable", timeout=4.0)
            if r.status_code == 200:
                return r.json()
            return {"success": False, "error": f"HTTP {r.status_code}: {r.text}"}
        except httpx.ConnectError:
            return {"success": False, "error": "LEMON_UNREACHABLE"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def disable_dns(self) -> Dict[str, Any]:
        """
        Deactivate Lemon DNS restrictions when Focus Mode turns OFF.
        May return rejection if Blackout (23:00-06:00) or Quarantine is active.
        """
        try:
            r = await self.client.post(f"{self.base_url}/dns/disable", timeout=4.0)
            if r.status_code == 200:
                data = r.json()
                # Inspect success field per contract
                return data
            return {"success": False, "error": f"HTTP {r.status_code}: {r.text}"}
        except httpx.ConnectError:
            return {"success": False, "error": "LEMON_UNREACHABLE"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # --- Quarantine Integration ---

    async def get_active_quarantines(self) -> List[Dict[str, Any]]:
        """List active quarantines from Lemon."""
        try:
            r = await self.client.get(f"{self.base_url}/quarantine/status", timeout=3.0)
            if r.status_code == 200:
                return r.json()
        except Exception as e:
            logger.debug(f"Lemon quarantine query failed: {e}")
        return []

    async def create_quarantine(
        self,
        target_value: str,
        duration_minutes: int = 60,
        target_type: str = "DOMAIN",
        reason: str = "Focus Session Protocol",
    ) -> Dict[str, Any]:
        """Create a new Quarantine lock in Lemon."""
        payload = {
            "target_type": target_type,
            "target_value": target_value,
            "duration_minutes": duration_minutes,
            "reason": reason,
        }
        try:
            r = await self.client.post(f"{self.base_url}/quarantine", json=payload, timeout=4.0)
            if r.status_code in (200, 201):
                return {"success": True, "data": r.json()}
            return {"success": False, "error": f"HTTP {r.status_code}: {r.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_pending_quarantine_requests(self) -> List[Dict[str, Any]]:
        """List pending 30-day weakening change requests."""
        try:
            r = await self.client.get(f"{self.base_url}/quarantine/pending-requests", timeout=3.0)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
        return []

    async def cancel_pending_quarantine_request(self, request_id: int) -> Dict[str, Any]:
        """Cancel a pending block removal to maintain strict filtering."""
        try:
            r = await self.client.post(f"{self.base_url}/quarantine/cancel-request/{request_id}", timeout=4.0)
            return {"success": r.status_code == 200, "data": r.json() if r.status_code == 200 else r.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # --- Activity Intelligence (Ephemeral Retrieval) ---

    async def get_activity_summary(self, target_date: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve Lemon's aggregated activity summary for target YYYY-MM-DD.
        Data is processed ephemerally: raw responses are NOT stored in Cherry DB.
        """
        try:
            r = await self.client.get(f"{self.base_url}/activity/date/{target_date}", timeout=5.0)
            if r.status_code == 200:
                data = r.json()
                # Extract essential high-level numbers; discard granular device logs
                return {
                    "date_str": target_date,
                    "total_active_seconds": data.get("total_active_seconds", 0.0),
                    "productive_seconds": data.get("productive_seconds", 0.0),
                    "entertainment_seconds": data.get("entertainment_seconds", 0.0),
                    "context_switches": data.get("context_switches", 0),
                    "longest_focus_seconds": data.get("longest_focus_seconds", 0.0),
                    "top_apps": [
                        {"app_name": a.get("app_name"), "duration_seconds": a.get("duration_seconds", 0)}
                        for a in data.get("top_apps", [])[:5]
                    ],
                    "top_domains": [
                        {"domain": d.get("domain"), "duration_seconds": d.get("duration_seconds", 0)}
                        for d in data.get("top_domains", [])[:5]
                    ],
                    "youtube_stats": {
                        "total_viewing_seconds": data.get("youtube_stats", {}).get("total_viewing_seconds", 0),
                        "shorts_seconds": data.get("youtube_stats", {}).get("shorts_seconds", 0),
                        "videos_watched_count": data.get("youtube_stats", {}).get("videos_watched_count", 0),
                    },
                }
            elif r.status_code == 404:
                logger.info(f"Lemon has no activity records for {target_date}.")
                return None
            else:
                logger.warning(f"Lemon activity retrieval for {target_date} returned {r.status_code}")
                return None
        except httpx.ConnectError:
            logger.info(f"Lemon is offline when querying activity for {target_date}.")
            return None
        except Exception as e:
            logger.warning(f"Error fetching Lemon activity for {target_date}: {e}")
            return None

    async def close(self):
        await self.client.aclose()


lemon_adapter = LemonAdapter()
