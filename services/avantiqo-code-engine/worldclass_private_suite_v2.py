"""Seeded private repository-suite substrate for Avantiqo Code World-Class V2.

This file defines task *families* and deterministic variant identities, not the
hidden assertions themselves. A certification runner materializes a fresh seed
into an isolated workspace, gives the model only the public task + repository,
and keeps hidden tests in a separate sealed location until final scoring.

The goal is to make memorizing a fixed patch useless while keeping every run
reproducible and auditable.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Any, Iterable

CONTRACT = "AVANTIQO_CODE_PRIVATE_SUITE_V2"
SUITE_VERSION = 2
MIN_CASES = 12


@dataclass(frozen=True)
class TaskFamily:
    family_id: str
    dimension: str
    public_goal: str
    editable_paths: tuple[str, ...]
    public_test_ids: tuple[str, ...]
    hidden_profile: str


FAMILIES: tuple[TaskFamily, ...] = (
    TaskFamily(
        "ts_service_api_contract",
        "multifile_typescript",
        "Repair a service/API contract mismatch while preserving callers and tests.",
        ("src/service", "src/api"),
        ("typecheck", "unit"),
        "cross-file types + runtime response invariants",
    ),
    TaskFamily(
        "sql_finance_migration",
        "sql_migration_invariant",
        "Repair a forward-safe SQL migration without losing existing data invariants.",
        ("supabase/migrations",),
        ("migration-check",),
        "idempotency + constraints + existing-row compatibility",
    ),
    TaskFamily(
        "concurrent_claim",
        "concurrency_idempotency",
        "Make concurrent claims idempotent and prevent duplicate side effects.",
        ("src/runtime", "src/db"),
        ("unit", "race"),
        "same-key races + retry/replay behavior",
    ),
    TaskFamily(
        "auth_precedence",
        "authorization_precedence",
        "Repair authorization precedence so deny rules cannot be bypassed.",
        ("src/auth", "src/api"),
        ("unit", "security"),
        "disabled/archived/org/role precedence",
    ),
    TaskFamily(
        "ledger_rounding",
        "money_ledger_rounding",
        "Repair ledger aggregation and rounding without violating accounting invariants.",
        ("src/finance",),
        ("unit", "property"),
        "raw-total rounding + currency normalization + malformed rows",
    ),
    TaskFamily(
        "next_boundary",
        "nextjs_server_client_boundary",
        "Repair a Next.js server/client boundary and preserve rendered behavior.",
        ("app", "components"),
        ("typecheck", "build-check"),
        "server-only imports + serialization + component contract",
    ),
    TaskFamily(
        "external_dispatch",
        "at_most_once_external_action",
        "Guarantee at-most-once dispatch across retries and ambiguous external outcomes.",
        ("src/orchestration", "src/providers"),
        ("unit", "failure-injection"),
        "claim-before-send + uncertain state + retry safety",
    ),
    TaskFamily(
        "hot_path",
        "performance_work_reduction",
        "Remove avoidable work from a hot path without changing externally visible behavior.",
        ("src/runtime",),
        ("unit", "performance"),
        "operation-count ceiling + behavioral equality",
    ),
    TaskFamily(
        "unsafe_boundary",
        "security_boundary",
        "Close an unsafe input/execution boundary while preserving intended capabilities.",
        ("src/security", "src/runtime"),
        ("unit", "security"),
        "path/shell/network/secret boundary abuse",
    ),
    TaskFamily(
        "refactor_contract",
        "behavior_preserving_refactor",
        "Refactor duplicated logic behind one contract with no observable regression.",
        ("src/domain",),
        ("unit", "snapshot"),
        "behavior equivalence + edge cases + minimal scope",
    ),
    TaskFamily(
        "malformed_inputs",
        "malformed_input_resilience",
        "Make the public boundary total and deterministic for malformed inputs.",
        ("src/api", "src/domain"),
        ("unit", "fuzz-lite"),
        "null/undefined/non-finite/non-string structures",
    ),
    TaskFamily(
        "api_version_skew",
        "cross_file_api_contract",
        "Repair version skew between producer, consumer and shared contract.",
        ("src/contracts", "src/producer", "src/consumer"),
        ("typecheck", "integration"),
        "producer/consumer compatibility + missing/extra fields",
    ),
)


def _digest(secret: bytes, value: str) -> str:
    return hmac.new(secret, value.encode("utf-8"), hashlib.sha256).hexdigest()


def variant_id(secret: bytes, run_seed: str, family: TaskFamily) -> str:
    if not secret:
        raise ValueError("PRIVATE_SUITE_SECRET_REQUIRED")
    if not run_seed.strip():
        raise ValueError("RUN_SEED_REQUIRED")
    return _digest(secret, f"{SUITE_VERSION}:{run_seed}:{family.family_id}")[:20]


def public_manifest(secret: bytes, run_seed: str) -> list[dict[str, Any]]:
    """Return model-safe metadata. Hidden profiles/assertions are deliberately absent."""
    return [
        {
            "case_id": f"{family.family_id}-{variant_id(secret, run_seed, family)}",
            "dimension": family.dimension,
            "public_goal": family.public_goal,
            "editable_paths": list(family.editable_paths),
            "public_test_ids": list(family.public_test_ids),
        }
        for family in FAMILIES
    ]


def sealed_manifest(secret: bytes, run_seed: str) -> list[dict[str, Any]]:
    """Runner-only metadata used after agent completion; never add this to prompts."""
    return [
        {
            "case_id": f"{family.family_id}-{variant_id(secret, run_seed, family)}",
            "family_id": family.family_id,
            "dimension": family.dimension,
            "hidden_profile": family.hidden_profile,
            "seal": _digest(secret, f"hidden:{SUITE_VERSION}:{run_seed}:{family.family_id}"),
        }
        for family in FAMILIES
    ]


def assert_suite_integrity(secret: bytes, run_seed: str) -> dict[str, Any]:
    public = public_manifest(secret, run_seed)
    sealed = sealed_manifest(secret, run_seed)
    public_ids = [item["case_id"] for item in public]
    sealed_ids = [item["case_id"] for item in sealed]
    dimensions = {item["dimension"] for item in public}

    encoded_public = json.dumps(public, sort_keys=True)
    for family in FAMILIES:
        if family.hidden_profile in encoded_public:
            raise RuntimeError("HIDDEN_PROFILE_LEAKED_TO_PUBLIC_MANIFEST")

    result = {
        "contract": CONTRACT,
        "suite_version": SUITE_VERSION,
        "cases": len(public),
        "unique_case_ids": len(public_ids) == len(set(public_ids)),
        "public_sealed_identity_match": public_ids == sealed_ids,
        "dimensions": len(dimensions),
        "hidden_profiles_model_visible": False,
        "seeded_variants": True,
        "reproducible": public_manifest(secret, run_seed) == public,
    }
    result["valid"] = all(
        (
            result["cases"] >= MIN_CASES,
            result["unique_case_ids"],
            result["public_sealed_identity_match"],
            result["dimensions"] >= MIN_CASES,
            not result["hidden_profiles_model_visible"],
            result["seeded_variants"],
            result["reproducible"],
        )
    )
    if not result["valid"]:
        raise RuntimeError(f"{CONTRACT}_INVALID:{result}")
    return result


def dimensions() -> set[str]:
    return {family.dimension for family in FAMILIES}


def families() -> Iterable[TaskFamily]:
    return FAMILIES
