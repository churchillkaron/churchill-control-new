"""Zero-cost admission for Private12 V17 native-MTP latency candidate."""

from __future__ import annotations

import inspect

import modal_code_qwen38_canary_runtime_v10 as runtime
import modal_code_qwen38_private12_v17_cert as cert
import repo_agent_v15 as agent


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> None:
    require(cert.ACTOR_MAX_TOKENS == 640, "ACTOR_BUDGET_CHANGED")
    require(cert.QUALITY_ACTOR_MAX_TOKENS == 768, "QUALITY_ACTOR_BUDGET_CHANGED")
    require(cert.REVIEWER_MAX_TOKENS == 256, "REVIEWER_BUDGET_CHANGED")
    require(cert.REPAIR_MAX_TOKENS == 1024, "REPAIR_BUDGET_CHANGED")
    require(cert.MAX_MODAL_QUALITY_BATCH_CALLS == 4, "QUALITY_CALL_LIMIT_CHANGED")
    require(cert.MAX_MODAL_SINGLE_LATENCY_CALLS == 3, "LATENCY_CALL_LIMIT_CHANGED")
    require(cert.MAX_MODAL_TOTAL_CALLS == 7, "TOTAL_CALL_LIMIT_CHANGED")
    require(cert.MAX_CASE_MODEL_SEQUENCES <= 4, "CASE_SEQUENCE_LIMIT_CHANGED")

    require(cert.agent is agent, "V16_AGENT_NOT_PRESERVED")
    require(cert.base.generate_v6 is not runtime.generate_v10, "BINDING_MUTATED_AT_IMPORT")
    source = inspect.getsource(cert._bind_v17)
    require("base.generate_v6 = runtime.generate_v10" in source, "V10_RUNTIME_NOT_BOUND")
    require("base.build_actor_prompt = agent.build_actor_prompt" in source, "ACTOR_NOT_V15")
    require("base.build_review_prompt = agent.build_review_prompt" in source, "REVIEWER_NOT_V15")
    require("base.build_repair_prompt = agent.build_repair_prompt" in source, "REPAIR_NOT_V15")
    require("base.parse_actor_result = agent.parse_actor_result" in source, "ACTOR_PARSER_NOT_V15")
    require("base.parse_review = agent.parse_review" in source, "REVIEW_PARSER_NOT_V15")

    require(runtime.ACTOR_SCHEMA is runtime.v9.ACTOR_SCHEMA, "ACTOR_SCHEMA_CHANGED")
    require(runtime.COMPACT_REVIEWER_SCHEMA is runtime.v9.COMPACT_REVIEWER_SCHEMA, "REVIEWER_SCHEMA_CHANGED")
    require(runtime.ENABLE_PREFIX_CACHING is True, "PREFIX_CACHE_DISABLED")
    require(runtime.FAST_BOOT_ENFORCE_EAGER is False, "CUDA_GRAPH_PATH_CHANGED")
    require(runtime.MTP_SPECULATIVE_CONFIG == {"method": "mtp", "num_speculative_tokens": 1}, "MTP_CONFIG_INVALID")
    require(runtime._FUNCTION_OPTIONS.get("gpu") == runtime.v9._FUNCTION_OPTIONS.get("gpu"), "GPU_POLICY_CHANGED")
    require(runtime._FUNCTION_OPTIONS.get("volumes") == runtime.v9._FUNCTION_OPTIONS.get("volumes"), "STORAGE_POLICY_CHANGED")

    runtime_source = inspect.getsource(runtime)
    for forbidden in (
        "create_if_missing=True",
        "production_routing_change\": True",
        "production_deploy_performed\": True",
        "model_download_performed\": True",
        "volume_created\": True",
    ):
        require(forbidden not in runtime_source, f"ISOLATION_REGRESSION:{forbidden}")

    print("AVANTIQO_CODE_PRIVATE12_V17_NATIVE_MTP_ZERO_COST=PASS", flush=True)


if __name__ == "__main__":
    main()
