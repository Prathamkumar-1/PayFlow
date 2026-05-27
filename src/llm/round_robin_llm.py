"""
PayFlow — Round-Robin Cloud LLM API Key Pool
=============================================
Manages up to 30 Claude (Anthropic) and Groq API keys in a round-robin
rotation with automatic failover, rate-limit detection, and health-based
key skipping.

Usage::

    pool = RoundRobinLLMPool.from_env()          # reads CLAUDE_KEY_1..30, GROQ_KEY_1..30
    # or build manually:
    pool = RoundRobinLLMPool(keys=[
        APIKeyEntry(provider="claude", key="sk-ant-..."),
        APIKeyEntry(provider="groq",   key="gsk_..."),
        ...
    ])

    response = await pool.complete(
        messages=[{"role": "user", "content": "Analyze this fraud pattern..."}],
        system="You are a PayFlow fraud analyst.",
        max_tokens=1024,
    )
    print(response.content)     # str
    print(response.provider)    # "claude" or "groq"
    print(response.key_index)   # which key was used

Rules:
  - Keys are tried in round-robin order per provider then across providers.
  - On 429 (rate-limit): key is cooled down for COOLDOWN_SECONDS (default 60s),
    then next key is tried immediately.
  - On 5xx / timeout: key is marked degraded for DEGRADED_SECONDS (default 30s).
  - On 4xx (bad key): key is permanently disabled for this session.
  - If ALL keys are exhausted, raises AllKeysExhaustedError.
  - Thread-safe: uses asyncio.Lock for index advancement.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Literal

logger = logging.getLogger(__name__)

# ── Tunable constants ────────────────────────────────────────────────────────

COOLDOWN_SECONDS  = 60    # pause after 429
DEGRADED_SECONDS  = 30    # pause after 5xx / timeout
MAX_RETRIES       = 30    # max keys to try before giving up (= pool size)
DEFAULT_MAX_TOKENS = 1024
DEFAULT_TEMPERATURE = 0.3


# ── Exceptions ────────────────────────────────────────────────────────────────

class AllKeysExhaustedError(RuntimeError):
    """Raised when every key in the pool has been tried and all failed."""


# ── Data models ──────────────────────────────────────────────────────────────

Provider = Literal["claude", "groq"]

@dataclass
class APIKeyEntry:
    provider: Provider
    key: str
    # Runtime health state
    disabled: bool = False           # permanent 4xx → disabled for session
    cooldown_until: float = 0.0      # time.monotonic() until which key is on cooldown
    degraded_until: float = 0.0      # time.monotonic() until which key is degraded
    total_calls: int = 0
    total_errors: int = 0
    total_cooldowns: int = 0

    @property
    def is_available(self) -> bool:
        if self.disabled:
            return False
        now = time.monotonic()
        if now < self.cooldown_until:
            return False
        if now < self.degraded_until:
            return False
        return True

    @property
    def status(self) -> str:
        if self.disabled:
            return "disabled"
        now = time.monotonic()
        if now < self.cooldown_until:
            remaining = round(self.cooldown_until - now)
            return f"cooldown:{remaining}s"
        if now < self.degraded_until:
            remaining = round(self.degraded_until - now)
            return f"degraded:{remaining}s"
        return "ok"

    def snapshot(self) -> dict:
        return {
            "provider": self.provider,
            "key_suffix": self.key[-6:] if len(self.key) >= 6 else "***",
            "status": self.status,
            "total_calls": self.total_calls,
            "total_errors": self.total_errors,
            "total_cooldowns": self.total_cooldowns,
        }


@dataclass
class LLMCloudResponse:
    content: str
    provider: Provider
    key_index: int
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: float = 0.0


# ── Round-Robin Pool ─────────────────────────────────────────────────────────

class RoundRobinLLMPool:
    """
    Thread-safe round-robin pool of Claude + Groq API keys.

    The pool advances a cursor across all keys. Each call picks the next
    available (non-cooled-down, non-degraded, non-disabled) key. On failure the
    cursor advances and the next key is tried, up to MAX_RETRIES attempts.
    """

    def __init__(self, keys: list[APIKeyEntry]) -> None:
        if not keys:
            raise ValueError("RoundRobinLLMPool requires at least one API key.")
        self._keys: list[APIKeyEntry] = keys
        self._cursor: int = 0
        self._lock = asyncio.Lock()
        logger.info(
            "RoundRobinLLMPool initialized: %d keys (%d claude, %d groq)",
            len(keys),
            sum(1 for k in keys if k.provider == "claude"),
            sum(1 for k in keys if k.provider == "groq"),
        )

    # ── Factory ──────────────────────────────────────────────────────────────

    @classmethod
    def from_env(
        cls,
        max_claude: int = 30,
        max_groq: int = 30,
    ) -> "RoundRobinLLMPool":
        """
        Auto-discover keys from environment variables.

        Claude keys: CLAUDE_KEY_1 … CLAUDE_KEY_30
                     ANTHROPIC_API_KEY_1 … ANTHROPIC_API_KEY_30
                     (also plain ANTHROPIC_API_KEY / CLAUDE_API_KEY)

        Groq keys:   GROQ_KEY_1 … GROQ_KEY_30
                     GROQ_API_KEY_1 … GROQ_API_KEY_30
                     (also plain GROQ_API_KEY)
        """
        keys: list[APIKeyEntry] = []

        # Claude keys
        for i in range(1, max_claude + 1):
            for var in (f"CLAUDE_KEY_{i}", f"ANTHROPIC_API_KEY_{i}"):
                val = os.getenv(var, "").strip()
                if val:
                    keys.append(APIKeyEntry(provider="claude", key=val))
                    break
        # Also accept single-key env vars (common dev setup)
        for var in ("ANTHROPIC_API_KEY", "CLAUDE_API_KEY"):
            val = os.getenv(var, "").strip()
            if val and not any(k.key == val for k in keys):
                keys.append(APIKeyEntry(provider="claude", key=val))

        # Groq keys
        for i in range(1, max_groq + 1):
            for var in (f"GROQ_KEY_{i}", f"GROQ_API_KEY_{i}"):
                val = os.getenv(var, "").strip()
                if val:
                    keys.append(APIKeyEntry(provider="groq", key=val))
                    break
        for var in ("GROQ_API_KEY",):
            val = os.getenv(var, "").strip()
            if val and not any(k.key == val for k in keys):
                keys.append(APIKeyEntry(provider="groq", key=val))

        if not keys:
            logger.warning(
                "RoundRobinLLMPool.from_env(): no API keys found in environment. "
                "Set CLAUDE_KEY_1…30 or GROQ_KEY_1…30."
            )
            # Return an empty-but-valid pool that will always raise on use
            return cls([APIKeyEntry(provider="groq", key="__placeholder__", disabled=True)])

        return cls(keys)

    # ── Key selection ─────────────────────────────────────────────────────────

    async def _next_available_index(self) -> int | None:
        """Advance cursor to the next available key. Returns None if all exhausted."""
        async with self._lock:
            start = self._cursor
            size = len(self._keys)
            for _ in range(size):
                idx = self._cursor % size
                self._cursor = (self._cursor + 1) % size
                if self._keys[idx].is_available:
                    return idx
                # Check if a cooled-down key is past its cooldown
                if not self._keys[idx].disabled:
                    # Already handled by is_available; just skip
                    pass
            return None  # All keys exhausted / cooled

    # ── Inference ─────────────────────────────────────────────────────────────

    async def complete(
        self,
        messages: list[dict],
        system: str | None = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        temperature: float = DEFAULT_TEMPERATURE,
        model_claude: str = "claude-3-5-haiku-20241022",
        model_groq: str = "llama-3.1-8b-instant",
    ) -> LLMCloudResponse:
        """
        Run inference through the pool. Tries up to MAX_RETRIES keys.

        Args:
            messages:     OpenAI-style message list [{"role":..., "content":...}]
            system:       Optional system prompt (inserted for Claude automatically)
            max_tokens:   Maximum completion tokens
            temperature:  Sampling temperature
            model_claude: Claude model ID to use
            model_groq:   Groq model ID to use

        Returns:
            LLMCloudResponse with .content and metadata

        Raises:
            AllKeysExhaustedError if every key fails.
        """
        last_error: Exception | None = None

        for attempt in range(MAX_RETRIES):
            idx = await self._next_available_index()
            if idx is None:
                # All keys are currently on cooldown — wait briefly and retry
                await asyncio.sleep(2.0)
                idx = await self._next_available_index()
                if idx is None:
                    raise AllKeysExhaustedError(
                        f"All {len(self._keys)} API keys exhausted after {attempt} attempts. "
                        f"Last error: {last_error}"
                    )

            entry = self._keys[idx]
            entry.total_calls += 1
            t0 = time.monotonic()

            try:
                if entry.provider == "claude":
                    response = await self._call_claude(
                        entry=entry,
                        messages=messages,
                        system=system,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        model=model_claude,
                    )
                else:
                    response = await self._call_groq(
                        entry=entry,
                        messages=messages,
                        system=system,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        model=model_groq,
                    )

                latency_ms = (time.monotonic() - t0) * 1000
                response.latency_ms = latency_ms
                response.key_index = idx

                logger.debug(
                    "RoundRobin: key[%d] %s/%s → OK (%.0fms, %d tokens)",
                    idx,
                    entry.provider,
                    entry.key[-4:],
                    latency_ms,
                    response.completion_tokens,
                )
                return response

            except _RateLimitError as exc:
                entry.total_errors += 1
                entry.total_cooldowns += 1
                entry.cooldown_until = time.monotonic() + COOLDOWN_SECONDS
                last_error = exc
                logger.warning(
                    "RoundRobin: key[%d] %s rate-limited → cooldown %ds",
                    idx, entry.provider, COOLDOWN_SECONDS,
                )
                continue

            except _AuthError as exc:
                entry.total_errors += 1
                entry.disabled = True
                last_error = exc
                logger.error(
                    "RoundRobin: key[%d] %s auth error → permanently disabled: %s",
                    idx, entry.provider, exc,
                )
                continue

            except _ServerError as exc:
                entry.total_errors += 1
                entry.degraded_until = time.monotonic() + DEGRADED_SECONDS
                last_error = exc
                logger.warning(
                    "RoundRobin: key[%d] %s server error → degraded %ds: %s",
                    idx, entry.provider, DEGRADED_SECONDS, exc,
                )
                continue

            except Exception as exc:
                entry.total_errors += 1
                entry.degraded_until = time.monotonic() + DEGRADED_SECONDS
                last_error = exc
                logger.warning(
                    "RoundRobin: key[%d] %s unexpected error → degraded %ds: %s",
                    idx, entry.provider, DEGRADED_SECONDS, exc,
                )
                continue

        raise AllKeysExhaustedError(
            f"All attempts exhausted after {MAX_RETRIES} tries. Last error: {last_error}"
        )

    # ── Provider call implementations ────────────────────────────────────────

    async def _call_claude(
        self,
        entry: APIKeyEntry,
        messages: list[dict],
        system: str | None,
        max_tokens: int,
        temperature: float,
        model: str,
    ) -> LLMCloudResponse:
        """Call Anthropic Claude API."""
        try:
            import anthropic
        except ImportError as exc:
            raise RuntimeError(
                "anthropic package not installed. Run: pip install anthropic"
            ) from exc

        client = anthropic.AsyncAnthropic(api_key=entry.key)

        try:
            kwargs: dict = {
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [m for m in messages if m.get("role") != "system"],
            }
            if system:
                kwargs["system"] = system
            elif any(m.get("role") == "system" for m in messages):
                kwargs["system"] = next(
                    m["content"] for m in messages if m.get("role") == "system"
                )

            resp = await client.messages.create(**kwargs)

            content = resp.content[0].text if resp.content else ""
            return LLMCloudResponse(
                content=content,
                provider="claude",
                key_index=0,
                model=model,
                prompt_tokens=resp.usage.input_tokens,
                completion_tokens=resp.usage.output_tokens,
            )

        except anthropic.RateLimitError as exc:
            raise _RateLimitError(str(exc)) from exc
        except anthropic.AuthenticationError as exc:
            raise _AuthError(str(exc)) from exc
        except anthropic.APIStatusError as exc:
            if exc.status_code >= 500:
                raise _ServerError(str(exc)) from exc
            raise

    async def _call_groq(
        self,
        entry: APIKeyEntry,
        messages: list[dict],
        system: str | None,
        max_tokens: int,
        temperature: float,
        model: str,
    ) -> LLMCloudResponse:
        """Call Groq API (OpenAI-compatible)."""
        try:
            from groq import AsyncGroq
        except ImportError as exc:
            raise RuntimeError(
                "groq package not installed. Run: pip install groq"
            ) from exc

        client = AsyncGroq(api_key=entry.key)

        # Groq uses OpenAI-compatible messages including system
        full_messages = list(messages)
        if system and not any(m.get("role") == "system" for m in full_messages):
            full_messages = [{"role": "system", "content": system}] + full_messages

        try:
            from groq import RateLimitError as GroqRateLimitError
            from groq import AuthenticationError as GroqAuthError

            resp = await client.chat.completions.create(
                model=model,
                messages=full_messages,  # type: ignore[arg-type]
                max_tokens=max_tokens,
                temperature=temperature,
            )

            content = resp.choices[0].message.content or ""
            usage = resp.usage
            return LLMCloudResponse(
                content=content,
                provider="groq",
                key_index=0,
                model=model,
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
            )

        except GroqRateLimitError as exc:
            raise _RateLimitError(str(exc)) from exc
        except GroqAuthError as exc:
            raise _AuthError(str(exc)) from exc
        except Exception as exc:
            # Catch Groq's InternalServerError by message pattern
            msg = str(exc).lower()
            if "500" in msg or "internal" in msg or "server" in msg:
                raise _ServerError(str(exc)) from exc
            raise

    # ── Convenience: single-prompt shortcut ──────────────────────────────────

    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        temperature: float = DEFAULT_TEMPERATURE,
    ) -> str:
        """Simple single-turn prompt → string response."""
        resp = await self.complete(
            messages=[{"role": "user", "content": prompt}],
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return resp.content

    # ── Pool health snapshot ─────────────────────────────────────────────────

    def snapshot(self) -> dict:
        """Runtime health of every key in the pool."""
        available = sum(1 for k in self._keys if k.is_available)
        return {
            "total_keys": len(self._keys),
            "available_keys": available,
            "cursor": self._cursor,
            "keys": [
                {"index": i, **k.snapshot()}
                for i, k in enumerate(self._keys)
            ],
        }

    def available_count(self) -> int:
        return sum(1 for k in self._keys if k.is_available)

    def has_any_available(self) -> bool:
        return self.available_count() > 0


# ── Internal error taxonomy ───────────────────────────────────────────────────

class _RateLimitError(Exception):
    """HTTP 429 from any provider."""

class _AuthError(Exception):
    """Bad API key (HTTP 401/403)."""

class _ServerError(Exception):
    """Provider server-side error (HTTP 5xx)."""


# ── Module-level singleton + lazy init ───────────────────────────────────────

_pool: RoundRobinLLMPool | None = None


def get_llm_pool() -> RoundRobinLLMPool:
    """
    Return the module-level singleton pool.
    Auto-discovers keys from environment variables on first call.
    Call configure_llm_pool() first to supply keys programmatically.
    """
    global _pool
    if _pool is None:
        _pool = RoundRobinLLMPool.from_env()
    return _pool


def configure_llm_pool(keys: list[APIKeyEntry]) -> RoundRobinLLMPool:
    """
    Programmatically configure the global pool (useful in tests or main.py).

    Example::

        from src.llm.round_robin_llm import configure_llm_pool, APIKeyEntry
        pool = configure_llm_pool([
            APIKeyEntry(provider="claude", key="sk-ant-..."),
            APIKeyEntry(provider="groq",   key="gsk_..."),
            # ... up to 30 total
        ])
    """
    global _pool
    _pool = RoundRobinLLMPool(keys)
    return _pool


def reset_pool() -> None:
    """Reset the singleton (useful in tests)."""
    global _pool
    _pool = None
