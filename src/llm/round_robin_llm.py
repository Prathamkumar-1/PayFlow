"""
PayFlow — Round-Robin Cloud LLM API Key Pool
=============================================
Manages up to 30 Claude (Anthropic) and 30 Groq API keys in a round-robin
rotation with automatic failover, escalating cooldowns, health monitoring,
and a penalty/decay system for deprioritizing repeatedly failing keys.

Inspired by the freellmapi (github.com/tashfeenahmed/freellmapi) router model.

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
  - Separate round-robin cursors per provider (claude / groq).
  - Escalating cooldowns on 429: 2min → 10min → 1hr → 24hr per hit count.
  - On 5xx / timeout: key is marked degraded for DEGRADED_SECONDS (30s).
  - On 4xx bad key: key is permanently disabled for this session.
  - Penalty/decay system: repeated failures add penalty; good calls decay it.
  - Background health checker validates all healthy keys every 5 minutes,
    auto-disabling keys that fail 3 consecutive health probes.
  - If ALL keys are exhausted, raises AllKeysExhaustedError.
  - Thread-safe: uses asyncio.Lock for index advancement per provider.
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

# Escalating cooldown durations (seconds) indexed by hit count (capped at last)
# Mirrors freellmapi: 2min, 10min, 1hr, 24hr
COOLDOWN_LADDER: list[float] = [
    2 * 60,        # 1st rate-limit hit
    10 * 60,       # 2nd
    60 * 60,       # 3rd
    24 * 60 * 60,  # 4th and beyond
]

DEGRADED_SECONDS       = 30      # pause after 5xx / timeout
MAX_RETRIES            = 60      # max keys to try (covers full 30+30 pool)
HEALTH_CHECK_INTERVAL  = 300     # seconds between background health probes (5 min)
MAX_CONSECUTIVE_FAILS  = 3       # auto-disable after this many health failures
PENALTY_PER_ERROR      = 3       # penalty points added per rate-limit hit
MAX_PENALTY            = 10      # penalty cap
PENALTY_DECAY_INTERVAL = 120     # seconds between automatic penalty decay ticks

DEFAULT_MAX_TOKENS  = 1024
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
    cooldown_until: float = 0.0      # monotonic time until cooldown expires
    degraded_until: float = 0.0      # monotonic time until degraded state expires
    cooldown_hits: int = 0           # how many times this key was rate-limited
    consecutive_health_fails: int = 0
    # Usage counters
    total_calls: int = 0
    total_errors: int = 0
    total_cooldowns: int = 0
    # Penalty/decay for soft deprioritization
    penalty: float = 0.0
    _last_penalty_decay: float = field(default_factory=time.monotonic)

    def _decay_penalty(self) -> None:
        """Linearly decay penalty over time (called on each availability check)."""
        now = time.monotonic()
        elapsed = now - self._last_penalty_decay
        ticks = int(elapsed / PENALTY_DECAY_INTERVAL)
        if ticks > 0:
            self.penalty = max(0.0, self.penalty - ticks)
            self._last_penalty_decay = now

    @property
    def effective_penalty(self) -> float:
        self._decay_penalty()
        return self.penalty

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
            return f"cooldown:{round(self.cooldown_until - now)}s"
        if now < self.degraded_until:
            return f"degraded:{round(self.degraded_until - now)}s"
        if self.penalty > 0:
            return f"ok(penalty:{self.penalty:.0f})"
        return "ok"

    def apply_rate_limit(self) -> None:
        """Apply escalating cooldown based on how many times this key has been hit."""
        self.cooldown_hits += 1
        self.total_cooldowns += 1
        ladder_idx = min(self.cooldown_hits - 1, len(COOLDOWN_LADDER) - 1)
        duration = COOLDOWN_LADDER[ladder_idx]
        self.cooldown_until = time.monotonic() + duration
        # Accumulate penalty for load-based deprioritization
        self.penalty = min(self.penalty + PENALTY_PER_ERROR, MAX_PENALTY)
        logger.warning(
            "RoundRobin: key[%s…] %s rate-limited (hit #%d) → cooldown %.0fs",
            self.key[-6:], self.provider, self.cooldown_hits, duration,
        )

    def apply_degraded(self) -> None:
        self.degraded_until = time.monotonic() + DEGRADED_SECONDS

    def record_success(self) -> None:
        """Decay penalty on a successful call."""
        if self.penalty > 0:
            self.penalty = max(0.0, self.penalty - 1)
        # Reset consecutive health fails on any live success
        self.consecutive_health_fails = 0

    def snapshot(self) -> dict:
        self._decay_penalty()
        return {
            "provider": self.provider,
            "key_suffix": self.key[-6:] if len(self.key) >= 6 else "***",
            "status": self.status,
            "penalty": round(self.penalty, 1),
            "cooldown_hits": self.cooldown_hits,
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

    - Separate cursor per provider so Claude and Groq keys each cycle
      independently (matching freellmapi per-platform index tracking).
    - Escalating cooldowns: 2min → 10min → 1hr → 24hr per key hit count.
    - Penalty/decay: repeatedly failing keys are soft-deprioritized.
    - Background health checker: probes all non-disabled keys every 5 minutes
      and auto-disables any key that fails 3 consecutive health checks.
    """

    def __init__(self, keys: list[APIKeyEntry]) -> None:
        if not keys:
            raise ValueError("RoundRobinLLMPool requires at least one API key.")
        self._keys: list[APIKeyEntry] = keys
        # Per-provider cursors (freellmapi-style per-platform index)
        self._cursors: dict[Provider, int] = {"claude": 0, "groq": 0}
        self._locks: dict[Provider, asyncio.Lock] = {
            "claude": asyncio.Lock(),
            "groq": asyncio.Lock(),
        }
        self._global_lock = asyncio.Lock()
        self._health_task: asyncio.Task | None = None
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

        # Claude keys (numbered variants first)
        for i in range(1, max_claude + 1):
            for var in (f"CLAUDE_KEY_{i}", f"ANTHROPIC_API_KEY_{i}"):
                val = os.getenv(var, "").strip()
                if val:
                    keys.append(APIKeyEntry(provider="claude", key=val))
                    break
        # Single-key fallbacks (common dev setup)
        for var in ("ANTHROPIC_API_KEY", "CLAUDE_API_KEY"):
            val = os.getenv(var, "").strip()
            if val and not any(k.key == val for k in keys):
                keys.append(APIKeyEntry(provider="claude", key=val))

        # Groq keys (numbered variants first)
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
            return cls([APIKeyEntry(provider="groq", key="__placeholder__", disabled=True)])

        pool = cls(keys)
        return pool

    # ── Background health checker ─────────────────────────────────────────────

    def start_health_checker(self) -> None:
        """
        Launch a background asyncio task that probes all non-disabled keys
        every HEALTH_CHECK_INTERVAL seconds and auto-disables keys that fail
        MAX_CONSECUTIVE_FAILS consecutive checks (mirrors freellmapi health.ts).
        """
        if self._health_task is not None and not self._health_task.done():
            return
        self._health_task = asyncio.create_task(self._health_loop(), name="llm-pool-health")
        logger.info("RoundRobinLLMPool: health checker started (interval=%ds)", HEALTH_CHECK_INTERVAL)

    def stop_health_checker(self) -> None:
        if self._health_task and not self._health_task.done():
            self._health_task.cancel()
            self._health_task = None

    async def _health_loop(self) -> None:
        while True:
            await asyncio.sleep(HEALTH_CHECK_INTERVAL)
            await self._check_all_keys()

    async def _check_all_keys(self) -> None:
        """Probe each non-disabled key with a minimal request."""
        for idx, entry in enumerate(self._keys):
            if entry.disabled:
                continue
            healthy = await self._probe_key(entry)
            if healthy:
                entry.consecutive_health_fails = 0
                logger.debug("Health: key[%d] %s OK", idx, entry.provider)
            else:
                entry.consecutive_health_fails += 1
                logger.warning(
                    "Health: key[%d] %s fail #%d",
                    idx, entry.provider, entry.consecutive_health_fails,
                )
                if entry.consecutive_health_fails >= MAX_CONSECUTIVE_FAILS:
                    entry.disabled = True
                    logger.error(
                        "Health: key[%d] %s auto-disabled after %d consecutive failures",
                        idx, entry.provider, MAX_CONSECUTIVE_FAILS,
                    )

    async def _probe_key(self, entry: APIKeyEntry) -> bool:
        """
        Send a minimal API request to verify the key is still valid.
        Returns True if the key is healthy, False on any auth/server error.
        Rate-limit responses (429) are treated as healthy — key is valid.
        """
        try:
            if entry.provider == "claude":
                await self._call_claude(
                    entry=entry,
                    messages=[{"role": "user", "content": "ping"}],
                    system=None,
                    max_tokens=1,
                    temperature=0.0,
                    model="claude-3-5-haiku-20241022",
                )
            else:
                await self._call_groq(
                    entry=entry,
                    messages=[{"role": "user", "content": "ping"}],
                    system=None,
                    max_tokens=1,
                    temperature=0.0,
                    model="llama-3.1-8b-instant",
                )
            return True
        except _RateLimitError:
            # 429 means the key is valid — just rate-limited
            return True
        except _AuthError:
            return False
        except Exception:
            return False

    # ── Key selection (per-provider cursor) ───────────────────────────────────

    async def _next_available_index(self, provider: Provider) -> int | None:
        """
        Advance the per-provider cursor to the next available key.
        Keys with lower effective_penalty are preferred when multiple are available.
        Returns the global index into self._keys, or None if all exhausted.
        """
        provider_keys = [(i, k) for i, k in enumerate(self._keys) if k.provider == provider]
        if not provider_keys:
            return None

        async with self._locks[provider]:
            size = len(provider_keys)
            cursor = self._cursors[provider]

            # First pass: find available keys sorted by penalty (lowest first)
            available = [
                (i, k) for i, k in provider_keys if k.is_available
            ]
            if not available:
                return None

            # Sort by penalty then by cursor order for fairness
            available.sort(key=lambda x: (x[1].effective_penalty, (provider_keys.index(x) - cursor) % size))

            # Advance cursor to the chosen key's position in the provider list
            chosen_global_idx = available[0][0]
            chosen_local_idx = next(
                j for j, (gi, _) in enumerate(provider_keys) if gi == chosen_global_idx
            )
            self._cursors[provider] = (chosen_local_idx + 1) % size
            return chosen_global_idx

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
        Run inference through the pool. Tries up to MAX_RETRIES keys across
        both providers, using per-provider round-robin cursors.

        Provider preference order: claude first, then groq as fallback.
        Within each provider, keys with lower penalty are tried first.

        Args:
            messages:     OpenAI-style message list [{"role":..., "content":...}]
            system:       Optional system prompt
            max_tokens:   Maximum completion tokens
            temperature:  Sampling temperature
            model_claude: Claude model ID
            model_groq:   Groq model ID

        Returns:
            LLMCloudResponse with .content and metadata

        Raises:
            AllKeysExhaustedError if every key fails.
        """
        last_error: Exception | None = None
        # Track which individual keys we've already tried this call
        tried: set[int] = set()

        for attempt in range(MAX_RETRIES):
            # Try Claude keys first, then Groq
            idx: int | None = None
            for provider in ("claude", "groq"):
                candidate = await self._next_available_index(provider)  # type: ignore[arg-type]
                if candidate is not None and candidate not in tried:
                    idx = candidate
                    break

            if idx is None:
                # All available keys tried — brief wait and one more attempt
                await asyncio.sleep(2.0)
                for provider in ("claude", "groq"):
                    candidate = await self._next_available_index(provider)  # type: ignore[arg-type]
                    if candidate is not None and candidate not in tried:
                        idx = candidate
                        break
                if idx is None:
                    raise AllKeysExhaustedError(
                        f"All {len(self._keys)} API keys exhausted after {attempt} attempts. "
                        f"Last error: {last_error}"
                    )

            tried.add(idx)
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
                entry.record_success()

                logger.debug(
                    "RoundRobin: key[%d] %s/%s → OK (%.0fms, %d tokens)",
                    idx, entry.provider, entry.key[-4:],
                    latency_ms, response.completion_tokens,
                )
                return response

            except _RateLimitError as exc:
                entry.total_errors += 1
                entry.apply_rate_limit()   # escalating cooldown + penalty
                last_error = exc
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
                entry.apply_degraded()
                last_error = exc
                logger.warning(
                    "RoundRobin: key[%d] %s server error → degraded %ds: %s",
                    idx, entry.provider, DEGRADED_SECONDS, exc,
                )
                continue

            except Exception as exc:
                entry.total_errors += 1
                entry.apply_degraded()
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
        claude_keys = [k for k in self._keys if k.provider == "claude"]
        groq_keys   = [k for k in self._keys if k.provider == "groq"]
        return {
            "total_keys": len(self._keys),
            "available_keys": available,
            "cursors": dict(self._cursors),
            "claude": {
                "total": len(claude_keys),
                "available": sum(1 for k in claude_keys if k.is_available),
            },
            "groq": {
                "total": len(groq_keys),
                "available": sum(1 for k in groq_keys if k.is_available),
            },
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
            # ... up to 30 of each
        ])
    """
    global _pool
    _pool = RoundRobinLLMPool(keys)
    return _pool


def reset_pool() -> None:
    """Reset the singleton (useful in tests)."""
    global _pool
    _pool = None
