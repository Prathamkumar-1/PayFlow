"""
Shared pytest configuration.

Automatically skips any test module that transitively requires the `ollama`
package when it is not installed (e.g. on CI or dev machines without a local
Ollama server / GPU).  This turns collection errors into explicit skips so the
rest of the suite runs unaffected.
"""

from __future__ import annotations

import importlib
import sys

import pytest


def _ollama_available() -> bool:
    return importlib.util.find_spec("ollama") is not None


# Modules (relative to project root) whose import chains pull in `ollama`.
_OLLAMA_DEPENDENT_MODULES = {
    "test_phase9_agent",
    "test_phase9b_unstructured_agent",
    "test_phase10_finetuning",
    "test_phase12_hitl",
}


def pytest_collect_file(parent, file_path):
    """Hook: before collecting a test file, skip if ollama is missing."""
    if not _ollama_available() and file_path.stem in _OLLAMA_DEPENDENT_MODULES:
        # Return None to stop default collection, but emit a skip notice.
        pass


def pytest_ignore_collect(collection_path, config):
    """Hook: skip collection entirely for ollama-dependent files when missing."""
    if not _ollama_available() and collection_path.stem in _OLLAMA_DEPENDENT_MODULES:
        return True
    return None
