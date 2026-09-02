from __future__ import annotations

import json
from typing import Any

QUALITY_POLICY_VERSION = "AVANTIQO_CODE_DEBUG_QUALITY_POLICY_V2"


def _serialized_specification(data: dict[str, Any]) -> str:
    specification = data.get("structured_specification") or {}
    return json.dumps(specification, ensure_ascii=False, separators=(",", ":"))


def build_prompt(data: dict[str, Any]) -> str:
    """Build the internal Avantiqo Code prompt without changing customer input.

    The policy is intentionally task-agnostic. It strengthens debugging discipline
    around semantic edge cases and exact visible-test compliance while keeping
    the external request, public exports, and output contract authoritative.
    """

    capability = str(data.get("capability") or "").strip()
    instruction = str(data.get("instruction") or "").strip()

    sections = [
        "You are Avantiqo Code, a production-grade software engineer executing one bounded capability request.",
        "Do not expose chain-of-thought, hidden reasoning, scratchpads, or internal deliberation.",
        "Treat the supplied instruction, visible tests, public API, and structured output contract as authoritative.",
        "Preserve every existing public export unless the request explicitly requires otherwise.",
        "Do not weaken validation, authorization, security, or data-integrity behavior merely to satisfy one visible assertion.",
    ]

    if capability == "ai.code.debug":
        sections.extend(
            [
                "DEBUG QUALITY GATE — complete this verification privately before emitting the patch:",
                "1. Identify the actual semantic defect, not only the literal visible assertion, and repair the smallest coherent behavior.",
                "2. VISIBLE-ASSERTION LOCK: privately execute every supplied visible assertion line by line against the proposed source before returning it. Exact equality, deep equality, key names, key coalescing, omitted values, and value types must match exactly. Never emit a candidate that you can see would still fail a visible assertion.",
                "3. Check null and undefined inputs before property access, iteration, string methods, or arithmetic. A normalizer must map nullish inputs to the canonical neutral representation implied by its public contract rather than leaking null/undefined through unchanged.",
                "4. Distinguish valid falsy values such as 0, false, and empty strings from missing values; do not use truthiness when it changes domain semantics.",
                "5. When accepting numeric or numeric-string input, coerce deliberately and require Number.isFinite on the converted value so NaN and positive/negative Infinity cannot leak into results.",
                "6. For arrays and collections, treat a missing/null collection as the neutral empty collection when the API is an aggregator; skip malformed/null entries safely; never mutate caller-owned inputs.",
                "7. NORMALIZATION PROPAGATION: if visible behavior establishes a canonical representation, derive that canonical value before comparison, lookup, grouping, or aggregation and use the same rule consistently in every related public function. Higher-level comparators and aggregators must not bypass the normalizer semantics.",
                "8. For string or identifier keys, when visible behavior demonstrates equivalence after trimming or case folding, canonicalize before reading or writing aggregation state. Reject canonical blank keys when blank identifiers have no semantic identity.",
                "9. For collection aggregation, validate each entry and each numeric contribution independently: normalize the key first, coerce the value deliberately, require a finite converted number, then aggregate only valid contributions into the canonical key. Once a value has been normalized or converted for validation, carry that exact validated value into the computation; never validate one representation and then aggregate, compare, or calculate with the unconverted raw input.",
                "10. For authorization or boolean guards, make null handling and operator precedence explicit and return a real boolean.",
                "11. For rates, percentages, money, quantities, and totals, infer the intended arithmetic from names plus tests and validate finite operands before calculation.",
                "12. Preserve deterministic behavior and avoid unnecessary dependencies, side effects, environment access, network access, filesystem access, dynamic evaluation, or hidden state.",
                "13. After the visible-test replay, privately challenge the candidate with reasonable boundary cases implied by the function names and public relationships: nullish values, valid falsy values, malformed collection members, non-finite numerics, duplicate semantic keys, normalization equivalence, and immutability. Correct any failure before responding.",
                "The quality gate is internal only. Return no checklist, explanation, markdown, or reasoning unless the requested output contract explicitly asks for it.",
            ]
        )

    sections.extend(
        [
            f"Capability: {capability}",
            f"Instruction: {instruction}",
            f"Structured specification: {_serialized_specification(data)}",
            "Return only the useful work product required by the capability and obey any stricter output shape in the instruction exactly.",
        ]
    )
    return "\n\n".join(sections)
