"""LLM access for Campus Pulse. Default: a local Ollama model — free, and no post
text ever leaves the machine. Anything with an async `json_chat` can stand in
(tests use a deterministic fake)."""
import json
from typing import Protocol

import httpx


class PulseLLMError(RuntimeError):
    pass


class PulseLLM(Protocol):
    name: str

    async def json_chat(self, system: str, user: str, schema: dict) -> dict: ...

    async def text_chat(self, system: str, user: str) -> str: ...


class OllamaLLM:
    def __init__(self, base_url: str, model: str, *, timeout: float = 900.0, num_ctx: int = 8192):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.name = f"{model} (local, Ollama)"
        self.timeout = timeout
        self.num_ctx = num_ctx

    async def _chat(self, system: str, user: str, fmt: dict | None) -> str:
        payload = {
            "model": self.model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            # temperature 0: the same week should produce (nearly) the same report.
            "options": {"temperature": 0, "num_ctx": self.num_ctx},
        }
        if fmt is not None:
            payload["format"] = fmt
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(f"{self.base_url}/api/chat", json=payload)
        r.raise_for_status()
        return r.json()["message"]["content"]

    async def json_chat(self, system: str, user: str, schema: dict) -> dict:
        """Reply forced to match `schema` (Ollama structured outputs). ~30% slower
        to generate than plain text, so used for the small calls only."""
        last_error: Exception | None = None
        for _ in range(2):
            try:
                return json.loads(await self._chat(system, user, schema))
            except (httpx.HTTPError, KeyError, json.JSONDecodeError) as exc:
                last_error = exc
        raise PulseLLMError(f"LLM call failed: {last_error}")

    async def text_chat(self, system: str, user: str) -> str:
        """Unconstrained reply — fastest; the caller parses and validates it strictly."""
        last_error: Exception | None = None
        for _ in range(2):
            try:
                return await self._chat(system, user, None)
            except (httpx.HTTPError, KeyError) as exc:
                last_error = exc
        raise PulseLLMError(f"LLM call failed: {last_error}")

    async def status(self) -> dict:
        """Is Ollama reachable, and is the configured model downloaded?"""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{self.base_url}/api/tags")
            r.raise_for_status()
            installed = {m.get("name") for m in r.json().get("models", [])}
            return {"reachable": True, "model_available": self.model in installed}
        except (httpx.HTTPError, ValueError):
            return {"reachable": False, "model_available": False}
