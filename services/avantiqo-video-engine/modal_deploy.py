"""Canonical deployment entrypoint for the owned Avantiqo Video Modal app.

Importing the sibling modules registers their decorated functions on the same
``modal_app.app`` object. Deploy this file rather than ``modal_app.py`` so the
persisted app exposes both the generation functions and the governed CPU job
adapter used by the JavaScript Service Runtime.

This module performs no inference and allocates no GPU by importing it.
"""
from __future__ import annotations

from modal_app import app

# These imports are intentionally side-effectful: each module decorates its
# canonical functions onto the shared ``app`` imported above.
import modal_native_controlled_master as _native_controlled_master  # noqa: F401,E402
import modal_native_job as _native_job  # noqa: F401,E402

DEPLOYMENT_CONTRACT = "AVANTIQO_VIDEO_MODAL_COMPLETE_SURFACE_DEPLOYMENT_V1"

__all__ = ["app", "DEPLOYMENT_CONTRACT"]
