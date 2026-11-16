"""
Basket AI Infrastructure Adapter for Cherry.
Communicates with Basket's central LLM and context endpoints.
Includes graceful offline fallback when Basket is unreachable.
"""
import logging
from typing import List, Dict, Any, Optional
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

CHERRY_SYSTEM_PROMPT = """You are Cherry, a local-first conversational productivity and behavioural intelligence assistant in the Fruits ecosystem.
You understand the user's personal operating system, calendar Quarter system (Day -> Quarter -> Season -> Verse), routines, and evidence-based feedback.
The backend owns the actual state and rules; you provide structured understanding, planning proposals, and evidence-grounded insights.
Always distinguish:
1. Observed facts (from real records)
2. User-reported explanations
3. Inferred hypotheses (clearly qualified)
Never invent missing data or pretend unconfirmed actions were completed."""


class BasketAdapter:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.BASKET_API_URL).rstrip("/")
        self.client = httpx.AsyncClient(timeout=15.0)

    async def is_available(self) -> bool:
        """Check if Basket AI core is reachable."""
        try:
            r = await self.client.get(f"{self.base_url}/llm/models", timeout=2.0)
            return r.status_code == 200
        except Exception:
            return False

    async def get_active_model(self) -> str:
        """Discover active loaded model or default to quince-llm."""
        try:
            r = await self.client.get(f"{self.base_url}/llm/models", timeout=3.0)
            if r.status_code == 200:
                data = r.json()
                models = data.get("models", [])
                if models and isinstance(models[0], dict) and "name" in models[0]:
                    return models[0]["name"]
                model_data = data.get("data", [])
                if model_data and isinstance(model_data[0], dict) and "id" in model_data[0]:
                    return model_data[0]["id"]
        except Exception as e:
            logger.debug(f"Could not query Basket models: {e}")
        return "quince-llm"

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
        max_tokens: int = 1024,
        system_prompt: Optional[str] = None,
    ) -> Optional[str]:
        """
        Send a chat completion request to Basket LLM.
        Returns generated text or None if Basket is offline.
        """
        full_system = system_prompt or CHERRY_SYSTEM_PROMPT
        payload_messages = [{"role": "system", "content": full_system}] + messages

        model_name = await self.get_active_model()
        payload = {
            "model": model_name,
            "messages": payload_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        headers = {
            "Content-Type": "application/json",
            "X-Basket-Application": "cherry",
        }

        try:
            r = await self.client.post(
                f"{self.base_url}/llm/chat",
                json=payload,
                headers=headers,
                timeout=30.0,
            )
            if r.status_code == 200:
                # Handle abstracted string or OpenAI choices object
                try:
                    data = r.json()
                    if isinstance(data, str):
                        return data
                    elif isinstance(data, dict):
                        choices = data.get("choices", [])
                        if choices:
                            return choices[0].get("message", {}).get("content", "")
                        return str(data)
                except Exception:
                    return r.text
            else:
                logger.warning(f"Basket chat returned status {r.status_code}: {r.text}")
                return None
        except httpx.ConnectError:
            logger.info("Basket AI core is offline. Falling back to deterministic logic.")
            return None
        except Exception as exc:
            logger.warning(f"Basket chat request failed: {exc}")
            return None

    async def add_context_memory(self, memory: str, is_temporary: bool = False) -> bool:
        """Store key facts in Basket context memory."""
        try:
            r = await self.client.post(
                f"{self.base_url}/context/memory/add",
                json={"application": "cherry", "memory": memory, "is_temporary": is_temporary},
                headers={"X-Basket-Application": "cherry"},
                timeout=5.0,
            )
            return r.status_code == 200
        except Exception as e:
            logger.debug(f"Basket context memory add skipped: {e}")
            return False

    async def get_all_context_memories(self) -> List[str]:
        """Retrieve stored context memories from Basket."""
        try:
            r = await self.client.post(
                f"{self.base_url}/context/memory/get_all",
                json={"application": "cherry"},
                headers={"X-Basket-Application": "cherry"},
                timeout=5.0,
            )
            if r.status_code == 200:
                data = r.json()
                return data.get("memories", [])
        except Exception:
            pass
        return []

    async def close(self):
        await self.client.aclose()


basket_adapter = BasketAdapter()
