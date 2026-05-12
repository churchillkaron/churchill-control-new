# Observability

## Current State
- Shared logging
- API scope logging
- Centralized error handling

---

## Future Goals

### Structured Logging
All logs should include:
- scope
- tenantId
- requestId
- timestamp
- severity
- operation

---

## Error Tracking

Planned:
- centralized error reporting
- operational incident tracking
- AI failure monitoring
- queue failure monitoring

---

## Metrics

Future metrics:
- API latency
- queue duration
- AI generation time
- publish success rate
- POS throughput
- kitchen completion time

---

## Audit Logging

Critical future requirement:
- financial changes
- payroll changes
- inventory changes
- approval actions
- AI publish actions

Should become auditable.

---

## Multi-Tenant Monitoring

Future observability should support:
- tenant-level analytics
- tenant-level errors
- tenant-level operational alerts

---

## Queue Monitoring

Future systems:
- generation queues
- publish queues
- operational queues

Need:
- retries
- dead-letter handling
- queue visibility

---

## AI Monitoring

Track:
- engine performance
- generation quality
- provider failures
- recommendation accuracy
- campaign performance

---

## Operational Monitoring

Critical operational domains:
- POS
- kitchen
- production
- payroll
- accounting

Need higher observability priority.

---

## Rules

- Logging should remain centralized
- Routes should not own logging logic
- Shared infrastructure owns observability
- Observability must remain tenant-safe