# AI Architecture

## AI Principles

AI systems must:
- remain modular
- remain observable
- remain replaceable
- remain domain-owned

AI should NEVER:
- directly own persistence
- directly own tenant resolution
- directly own API orchestration

---

## AI Layer Responsibilities

Location:
lib/marketing/ai/*
lib/finance/ai/*
lib/operations/ai/*

Responsibilities:
- prompt building
- recommendations
- scoring
- orchestration
- model routing
- analysis
- optimization

---

## AI Infrastructure Rules

Shared infrastructure belongs in:
lib/shared/*

Examples:
- logging
- validation
- http framework
- tenant resolution

---

## AI Service Pattern

Correct flow:

Route
→ service
→ AI orchestration
→ persistence

NOT:

Route
→ AI logic
→ DB
→ calculations
→ orchestration

---

## AI Engine Standards

Engines should:
- do one responsibility well
- remain composable
- remain replaceable

Examples:
- runVideoEngine
- runFluxEnhanceEngine
- runCompositeEngine

---

## AI Provider Rules

Providers should remain isolated.

Examples:
- OpenAI
- Flux
- Meta
- future providers

Never tightly couple provider logic to business workflows.

---

## AI Safety Rules

Never:
- hardcode tenant data
- bypass validation
- bypass shared logging
- bypass shared infrastructure

---

## Future AI Goals

Planned:
- autonomous recommendations
- predictive analytics
- operational intelligence
- self-optimizing campaigns
- AI business monitoring
- AI anomaly detection