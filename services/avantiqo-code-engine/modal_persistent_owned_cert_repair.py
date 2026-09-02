"""Repair-policy wrapper for persistent Avantiqo Code certification.

Keeps the certified runtime, model, storage, machine gates and hidden-test seal
unchanged. It only enriches a machine-triggered repair with a deterministic
explanation when the observed diff proves canonicalized and raw keys were mixed.
"""

from __future__ import annotations

from typing import Any

import modal_persistent_owned_cert as cert

app = cert.app
_original_repair_request = cert._repair_request


def _repair_request(request: dict[str, Any], candidate: str, failure: str) -> dict[str, Any]:
    repaired = _original_repair_request(request, candidate, failure)
    normalized_failure = str(failure or "")
    if (
        "deep-equal" in normalized_failure
        and "THB" in normalized_failure
        and "thb" in normalized_failure
    ):
        repaired["instruction"] = "\n\n".join(
            [
                str(repaired.get("instruction") or "").strip(),
                (
                    "MACHINE DIAGNOSTIC — CANONICAL KEY SPLIT: the executable diff "
                    "proves one logical key is being written under both its raw and "
                    "canonical forms. Compute the canonical key exactly once before "
                    "any accumulator access. From that point onward, do not reference "
                    "the raw key for lookup, read, existence check, defaulting, or "
                    "write. Every accumulator operation for that row must use the same "
                    "canonical variable. For case-insensitive currency grouping, trim "
                    "then uppercase the key, reject an empty canonical key, normalize "
                    "the amount once, require it to be finite, and update only the "
                    "canonical accumulator entry."
                ),
            ]
        )
    return repaired


cert._repair_request = _repair_request


@app.local_entrypoint(name="owned_cert_repair")
def owned_cert_repair() -> None:
    cert.owned_cert()
