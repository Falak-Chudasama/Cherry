"""
Basket AI Infrastructure Adapter for Cherry.
Communicates with Basket's central LLM (127.0.0.1:10010), context, and tiered RAG endpoints.
Strictly adheres to:
- X-Basket-Application: cherry
- Zero thinking mode (thinking: False, <no_thoughts>)
- GBNF grammar constraints
- Abstracted response format
"""
import logging
import json
from typing import List, Dict, Any, Optional, AsyncGenerator
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


class BasketAdapter:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.BASKET_API_URL).rstrip("/")
        self.client = httpx.AsyncClient(timeout=45.0)

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

    async def completion(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        grammar: Optional[str] = None,
        context: Optional[List[Dict[str, Any]]] = None,
        retrieve_notes: bool = False,
        retrieve_chat: bool = False,
        chat_id: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 512,
    ) -> Dict[str, Any]:
        """
        Call Basket POST /completion (or /llm/chat) with optional GBNF grammar and thinking disabled.
        """
        payload = {
            "prompt": prompt,
            "application": "cherry",
            "system_prompt": system_prompt or "You are Cherry, the system intelligence assistant.",
            "grammar": grammar,
            "context": context or [],
            "chat_id": chat_id,
            "retrieve_notes": retrieve_notes,
            "retrieve_chat": retrieve_chat,
            "temperature": temperature,
            "thinking": False,
            "abstracted": True,
            "stream": False,
        }
        headers = {
            "Content-Type": "application/json",
            "X-Basket-Application": "cherry",
        }

        # Try /completion endpoint first
        try:
            r = await self.client.post(
                f"{self.base_url}/completion",
                json=payload,
                headers=headers,
                timeout=45.0,
            )
            if r.status_code == 200:
                return r.json()
        except Exception as e:
            logger.debug(f"Basket /completion request failed: {e}")

        # Fallback to /llm/chat
        model_name = await self.get_active_model()
        chat_payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt or "You are Cherry, the system intelligence assistant."},
                {"role": "user", "content": prompt},
            ],
            "grammar": grammar,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "thinking": False,
            "abstracted": True,
            "stream": False,
        }
        try:
            r = await self.client.post(
                f"{self.base_url}/llm/chat",
                json=chat_payload,
                headers=headers,
                timeout=45.0,
            )
            if r.status_code == 200:
                data = r.json()
                content = ""
                if isinstance(data, str):
                    content = data
                elif isinstance(data, dict):
                    choices = data.get("choices", [])
                    if choices:
                        content = choices[0].get("message", {}).get("content", "")
                    else:
                        content = data.get("content", "")
                return {"status": "ok", "content": content, "application": "cherry"}
        except Exception as e:
            logger.warning(f"Basket /llm/chat fallback failed: {e}")

        return {"status": "error", "content": "", "application": "cherry"}

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
        max_tokens: int = 1024,
        system_prompt: Optional[str] = None,
        chat_id: Optional[str] = None,
    ) -> Optional[str]:
        """Send chat completion to Basket with thinking disabled."""
        full_system = system_prompt or "You are Cherry, the system intelligence assistant."
        payload_messages = [{"role": "system", "content": full_system}] + messages
        model_name = await self.get_active_model()
        payload = {
            "model": model_name,
            "messages": payload_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "thinking": False,
            "abstracted": True,
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
                data = r.json()
                if isinstance(data, str):
                    return data
                elif isinstance(data, dict):
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0].get("message", {}).get("content", "")
                    return data.get("content", str(data))
                return r.text
            return None
        except Exception:
            return None

    async def stream_chat_text(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.4,
        max_tokens: int = 1024,
    ) -> AsyncGenerator[str, None]:
        """
        Stream conversational chat from Basket /llm/chat with thinking disabled.
        Yields raw token deltas as strings.
        """
        model_name = await self.get_active_model()
        payload_messages = []
        if system_prompt:
            payload_messages.append({"role": "system", "content": system_prompt})
        payload_messages.extend(messages)

        payload = {
            "model": model_name,
            "messages": payload_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "thinking": False,
            "abstracted": True,
            "stream": True,
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream, text/plain",
            "X-Basket-Application": "cherry",
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as stream_client:
                async with stream_client.stream(
                    "POST",
                    f"{self.base_url}/llm/chat",
                    json=payload,
                    headers=headers,
                ) as response:
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        # Handle SSE data lines
                        if line.startswith("data: "):
                            raw_data = line[6:].strip()
                            if raw_data == "[DONE]":
                                break
                            try:
                                parsed = json.loads(raw_data)
                                choices = parsed.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {}).get("content", "")
                                    if delta:
                                        yield delta
                            except Exception:
                                yield raw_data
                        else:
                            yield line
        except Exception as exc:
            logger.warning(f"Basket stream error: {exc}")
            yield f"\n[Basket connection error: {exc}]"

    async def sync_note(
        self,
        action: str,
        note_id: str,
        title: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        payload = {
            "application": "cherry",
            "action": action,
            "note_id": str(note_id),
            "title": title,
            "content": content,
            "metadata": metadata or {},
        }
        try:
            r = await self.client.post(
                f"{self.base_url}/context/notes/sync",
                json=payload,
                headers={"Content-Type": "application/json", "X-Basket-Application": "cherry"},
                timeout=10.0,
            )
            return r.status_code == 200
        except Exception as e:
            logger.debug(f"Basket sync_note skipped: {e}")
            return False

    async def sync_command(
        self,
        action: str,
        command_id: str,
        command: str,
    ) -> bool:
        payload = {
            "application": "cherry",
            "action": action,
            "command_id": str(command_id),
            "command": command,
        }
        try:
            r = await self.client.post(
                f"{self.base_url}/context/commands/sync",
                json=payload,
                headers={"Content-Type": "application/json", "X-Basket-Application": "cherry"},
                timeout=10.0,
            )
            return r.status_code == 200
        except Exception as e:
            logger.debug(f"Basket sync_command skipped: {e}")
            return False

    async def query_notes_rag(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Query Basket's tiered RAG engine for relevant notes."""
        try:
            r = await self.client.post(
                f"{self.base_url}/context/rag/tiered-query",
                json={"application": "cherry", "query": query, "limit": limit},
                headers={"Content-Type": "application/json", "X-Basket-Application": "cherry"},
                timeout=10.0,
            )
            if r.status_code == 200:
                data = r.json()
                return data.get("notes", []) or data.get("results", [])
        except Exception as e:
            logger.debug(f"Basket notes RAG query failed: {e}")
        return []

    async def close(self):
        await self.client.aclose()


basket_adapter = BasketAdapter()
