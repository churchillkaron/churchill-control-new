# Avantiqo AI Architecture

**Status: living AI architecture guidance**

This document is subordinate to [`../ARCHITECTURE.md`](../ARCHITECTURE.md). AI is part of the Avantiqo platform architecture, not a separate chatbot/provider layer.

## Core principle

Avantiqo Intelligence should understand and operate the same governed business capabilities used by human users and automation.

Canonical direction:

**USER INTENT → INTELLIGENCE → BUSINESS CONTEXT → CAPABILITY DISCOVERY → DISCUSSION / PLAN WHEN NEEDED → AUTHORIZED EXECUTION → VERIFICATION → RESULT / EVIDENCE**

AI should not create a second business system beside the ERP.

## Responsibilities

Depending on the task, Intelligence may:

- understand natural-language/business intent
- inspect authorized business state
- reason and synthesize
- compare alternatives
- show numbers and evidence
- navigate the platform
- prepare documents and content
- discover/invoke capabilities
- execute authorized actions
- monitor long-running work
- verify outcomes
- explain results
- continue a workflow until the business goal is complete

AI is not limited to recommendations. It may execute when the underlying capability, permission, lifecycle, safety, and evidence contracts allow execution.

## Business context and authorization

AI must use canonical business context:

- `organization_id`
- `entity_id` where applicable
- `period_id` where applicable
- party relationships where applicable

Do not create AI-specific tenant resolution or hardcoded customer/business identifiers.

Intelligence does not bypass authorization. Autonomous execution must respect the same or stronger controls than equivalent human execution.

## Capability-first rule

If a real Avantiqo capability exists, AI should use it rather than reproducing the business logic in prompts or a special AI-only path.

Human UI, API, automation, and AI should converge on the same underlying business capability wherever they represent the same action.

This prevents divergent logic, duplicated validation, inconsistent financial effects, and untestable autonomous behavior.

## Deterministic systems + intelligence

Do not use an LLM for reliably computable tasks simply because AI is available.

Preferred pattern:

**AI reasoning / interpretation → deterministic execution → deterministic verification → AI explanation where useful**

Examples:

- AI interprets an accounting request; deterministic Finance runtime posts it; deterministic ledger checks verify it.
- AI interprets a data transformation request; deterministic code transforms/tests it; AI explains the result.
- AI develops a creative strategy; canonical Image/Video/Audio runtimes execute production; deterministic technical checks plus governed quality review validate outputs.

## Engine architecture

Strategic AI engines should increasingly be Avantiqo-owned/controlled where technically and economically sensible, including Intelligence, Code, Video, Voice/Audio, Image, and other core engines.

Engine boundaries should be defined by real capabilities and runtime requirements, not historical folders such as `lib/marketing/ai/*`.

An engine should have:

- clear input/output contract
- canonical execution path
- explicit ownership
- observable execution identity/state
- deterministic preflight where possible
- quality/correctness verification
- cost/latency measurement
- fail-closed certification state for important production claims

## Provider and compute boundaries

External model/provider logic must remain behind Avantiqo-owned capability/runtime abstractions.

Providers may be used for:

- specialist workloads
- fallback
- benchmarking
- temporary capability gaps
- workloads where external execution is measurably superior economically or technically

Do not tightly couple a business workflow to one model/provider unless a deliberate architectural decision proves that coupling is appropriate.

Provider/model replacement should not require rebuilding the business capability.

## Reasoning and latency

Intelligence and speed are first-class requirements together.

Avoid:

- unnecessary multi-agent chains
- repeated reasoning over unchanged context
- repeated inference for deterministic validation
- serial calls that can safely run in parallel
- oversized context that does not materially improve decisions
- expensive models for simple deterministic or low-complexity work

Use deeper reasoning only where it changes the outcome. Measure warm/cold latency and end-to-end task time, not only model-token throughput.

## Memory and learning

AI memory/learning must preserve provenance and should distinguish:

- source observation
- extracted fact
- inference
- hypothesis
- recommendation
- experiment result
- verified knowledge
- negative/refuted evidence

Business-specific memory must carry canonical organization/entity context where applicable. Learned data does not become financial/operational truth merely because a model generated it.

Learning should improve future decisions while preserving boundary conditions and negative evidence so Avantiqo does not repeatedly retry disproven assumptions.

## Execution safety

For payments, postings, purchases, external communications, destructive updates, GPU/provider generation, or other expensive/irreversible actions, Intelligence must use explicit execution identity and at-most-once/idempotent patterns.

Preferred lifecycle:

**prepare → identify → claim/reserve → dispatch once → observe → verify → settle**

If status becomes ambiguous, reconcile the existing execution. Do not instruct the model or transport to blindly submit another action.

## Evidence and observability

Important AI work should preserve appropriate:

- request/mission identity
- organization/entity context
- capability selected
- reasoning/decision artifacts where product-governance requires them (not hidden chain-of-thought)
- inputs/evidence references
- execution/job identity
- provider/engine identity where relevant
- resulting state/output
- verification result
- usage/cost
- errors/uncertainty
- timestamps

The system should be debuggable without treating raw private model reasoning as the audit mechanism.

## Creative AI

Creative Studio is a promptless intelligent production system:

**mission → business/brand context → brief → strategy → concept → storyboard → production plan → canonical AI capabilities → review/verification → final output/publication**

Raw provider prompts are implementation detail, not the primary user experience.

## AI quality and certification

World-class claims require comparative evidence.

Benchmark important engines against strong current alternatives using meaningful tasks and measure:

- correctness/quality
- task completion
- reasoning/decision quality
- autonomy
- latency
- reliability
- cost per successful outcome
- safety/governance
- human effort

A model response that looks plausible is not certification. Prefer executable tests, visible contracts, deterministic verification, and controlled real inference where required.

## Architecture test for new AI work

Before adding a model call, agent, engine, AI table, or provider path, ask:

1. What business capability is being improved?
2. Can deterministic logic solve this better?
3. Does a canonical Avantiqo engine/runtime already exist?
4. Will this create an AI-only path that diverges from the real capability?
5. What evidence/context does the model genuinely need?
6. What action safety/idempotency is required?
7. How will output be verified?
8. What latency and cost target matters?
9. What strong competitor/reference should it be measured against?
10. Can we invent a simpler/faster/more reliable solution than the conventional approach?
