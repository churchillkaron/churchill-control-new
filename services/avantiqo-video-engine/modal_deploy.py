"""Canonical deployment entrypoint for the owned Avantiqo Video Modal app.

Importing the sibling modules registers their decorated functions on the same
``modal_app.app`` object. Deploy this file rather than individual lane modules so
the persisted app exposes the complete governed Video surface used by Studio.

The deployment surface intentionally contains four quality lanes:
- canonical native-master / controlled-master generation;
- immediate certified Wan 2.2 investor proof rendering;
- fast purpose-generated investor preview T2V;
- production-detail investor DFR 4K.

Importing this module performs no inference and allocates no GPU.
"""
from __future__ import annotations

from modal_app import app

# These imports are intentionally side-effectful: each module decorates its
# canonical functions onto the shared ``app`` imported above.
import modal_native_controlled_master as _native_controlled_master  # noqa: F401,E402
import modal_native_job as _native_job  # noqa: F401,E402
import modal_investor_wan_proof as _investor_wan_proof  # noqa: F401,E402
import modal_investor_t2v as _investor_t2v  # noqa: F401,E402
import modal_investor_hq as _investor_hq  # noqa: F401,E402

DEPLOYMENT_CONTRACT = "AVANTIQO_VIDEO_MODAL_COMPLETE_SURFACE_DEPLOYMENT_V3"
DEPLOYED_QUALITY_LANES = (
    "IMMEDIATE_WAN22_PROOF_1280X720",
    "PREVIEW_DISTILLED_1920X1088",
    "PRODUCTION_DFR_3840X2176",
    "ULTRA_NATIVE_3840X2176",
)

__all__ = ["app", "DEPLOYMENT_CONTRACT", "DEPLOYED_QUALITY_LANES"]
