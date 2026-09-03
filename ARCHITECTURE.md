# AVANTIQO — PERMANENT ARCHITECTURE RULE

## 1. One coherent platform

Avantiqo is one intelligent business operating platform.

It must not become a collection of disconnected mini-products, duplicated runtimes, industry-specific applications, parallel databases, or one-off implementations.

Every new capability should strengthen the shared platform.

Before creating anything new, inspect what already exists and determine whether the requirement belongs inside an existing:

- domain
- workspace
- capability
- runtime
- service
- primitive
- API
- execution engine
- business object
- workflow
- provider
- document model

Reuse and extend the canonical system whenever that produces a clean architecture.

Do not create a second architecture simply because it is easier in the short term.

---

## 2. Canonical platform flow

The fundamental Avantiqo structure is:

**PLATFORM → USER → BUSINESS CONTEXT → UBTE → ERP\_REGISTRY → DOMAIN → WORKSPACE → CAPABILITY → DOCUMENT / ACTION / PROCESS**

This is the default architectural flow.

Changes should integrate into this system rather than bypassing it.

### Platform

Provides shared infrastructure, identity, services, AI, automation, governance, execution, permissions, usage, billing, audit and system capabilities.

### User

The human or authorized system interacting with Avantiqo.

A user may operate across multiple organizations, entities, roles and responsibilities.

### Business Context

Business context determines what the user is currently operating on.

Canonical context includes:

- `organization_id`
- `entity_id`
- `period_id` where relevant
- `party` where relevant to the business relationship

Business logic must use the canonical context rather than inventing local equivalents.

### UBTE

UBTE is part of the canonical business execution architecture.

Business capabilities should use the shared business/runtime architecture rather than creating isolated execution models.

### ERP\_REGISTRY

`ERP_REGISTRY` is the canonical registry controlling the ERP domain/workspace/capability structure.

Do not create shadow registries or independent hardcoded navigation structures where the registry should be authoritative.

### Domain

Domains represent major business capability areas.

Canonical domain families include:

- Dashboard
- Finance
- Operations
- Supply Chain
- Commercial
- People
- Projects
- Documents
- Analytics
- AI
- Solutions
- Administration
- Compliance
- Creative

Domains should remain meaningful business boundaries rather than becoming dumping grounds for unrelated features.

### Workspace

A workspace is the operational environment for related capabilities.

Workspaces should present the information, actions, processes and intelligence required to complete real business work.

They should not merely expose database tables.

### Capability

Capabilities are the primary reusable units of business functionality.

A capability should represent something the business can actually do.

Examples:

- reconcile a bank statement
- create a purchase order
- manage inventory
- generate an invoice
- review accounting work
- schedule staff
- execute a creative production
- analyze performance
- communicate with a customer

Capabilities should work through shared runtimes and business primitives whenever possible.

### Document / Action / Process

Capabilities may ultimately produce or manipulate:

- documents
- records
- actions
- transactions
- workflows
- decisions
- reports
- AI outputs

These should remain connected to their originating business context and audit/evidence chain.

---

## 3. Organization, entity and party — never tenant

Avantiqo's business model uses:

**organization → entity → party**

Do not introduce or reintroduce `tenant` as a business concept.

### Organization

Represents the operating organization/account boundary within Avantiqo.

### Entity

Represents the relevant legal, operating or business entity underneath the organization where required.

### Party

Represents people and organizations participating in business relationships.

A party can play different roles depending on context, such as:

- customer
- supplier
- employee
- contractor
- contact
- shareholder
- partner
- lead
- creditor
- debtor

Prefer reusable party relationships over creating separate incompatible person/company structures for every domain.

---

## 4. Industry-neutral architecture

Avantiqo must support many industries from the same core architecture.

Do not hardcode the platform around:

- restaurants
- hotels
- retail
- accounting firms
- construction
- agencies
- bars
- healthcare
- manufacturing
- logistics

Industry-specific behavior should normally be produced through:

**shared primitive + configuration + capability composition + business context**

rather than duplicated industry-specific systems.

For example:

A POS should not fundamentally mean "restaurant POS."

Its reusable primitives may include:

- orders
- products/services
- pricing
- customer
- payment
- fulfilment
- inventory
- tax
- receipt/document
- workstation/device
- user/staff
- accounting impact

A restaurant can compose those primitives differently from retail, hotel, entertainment or another business.

The primitives remain reusable.

---

## 5. Model business reality, not screens

Do not design architecture by looking at what screens competitors have.

Start with the underlying business reality.

Ask:

- What business object exists?
- What event occurred?
- What state changed?
- Who is responsible?
- What evidence exists?
- What action can happen next?
- What accounting or operational effect results?
- What permission is required?
- What should AI understand about it?

Then build the UI around that model.

The database should not simply mirror arbitrary frontend pages.

The frontend should not dictate fragmented backend architecture.

---

## 6. Capabilities over CRUD

Avantiqo should not become a CRUD ERP.

CRUD is infrastructure.

The user should experience **capabilities and workflows**.

Instead of:

"Edit table row"

prefer concepts such as:

- approve
- post
- reconcile
- receive
- fulfil
- allocate
- refund
- close
- review
- sign off
- investigate
- schedule
- publish
- generate
- execute

Lifecycle and business state should be explicit when the real-world process requires them.

---

## 7. Shared runtime before duplicated logic

Whenever multiple domains need the same underlying behavior, build or reuse a shared runtime.

Examples include:

- approvals
- documents
- payments
- workflow
- automation
- communications
- files
- audit
- AI execution
- usage
- wallet
- provider routing
- tasks
- scheduling
- notifications
- evidence
- identity
- authorization

Do not copy similar business logic into five domains.

Create one strong primitive/runtime and allow domains to use it.

---

## 8. AI is part of the platform architecture

AI must not be bolted onto Avantiqo as a chatbot sitting beside the ERP.

Avantiqo Intelligence should understand and operate through the same capabilities available to human users.

The desired structure is approximately:

**USER INTENT**
**→ INTELLIGENCE**
**→ BUSINESS CONTEXT**
**→ CAPABILITY DISCOVERY**
**→ DISCUSSION / PLAN WHEN NEEDED**
**→ AUTHORIZED EXECUTION**
**→ VERIFICATION**
**→ RESULT / EVIDENCE**

AI should be capable of:

- reading business state
- reasoning about it
- discussing alternatives
- showing evidence and numbers
- navigating the system
- creating documents/content
- invoking capabilities
- executing authorized actions
- monitoring processes
- verifying outcomes
- continuing until the business goal is complete

Do not create special fake AI-only business logic when the same real capability can be used.

Human UI and AI should ultimately operate the same business capabilities.

---

## 9. Deterministic systems + intelligence

Do not use an LLM for everything.

Use deterministic code where the answer can be computed reliably.

Use AI where reasoning, judgment, interpretation, creativity or adaptation adds value.

Strong Avantiqo workflows can combine:

**AI reasoning → deterministic execution → deterministic verification**

Examples:

- AI understands the user's request.
- Deterministic runtime performs the accounting transaction.
- Deterministic verification confirms the ledger remains valid.
- AI explains the result.

This is generally stronger than asking a model to produce an answer and trusting it.

---

## 10. Execution must be real

A capability is not complete because a button exists.

End-to-end means:

**user intent**
**→ correct capability**
**→ authorization**
**→ execution**
**→ persistence**
**→ side effects**
**→ verification**
**→ evidence**
**→ visible result**

Tests should prove this chain wherever practical.

Fake mocks, static UI demonstrations and optimistic success responses are not production certification.

---

## 11. At-most-once protection for expensive or destructive actions

For operations involving:

- payments
- posting
- external communication
- purchases
- GPU generation
- provider execution
- destructive updates
- irreversible business actions

uncertainty must not be solved by blindly executing again.

Preferred lifecycle:

**prepare → identify → claim/reserve → dispatch once → observe → verify → settle**

If execution state becomes ambiguous, record uncertainty and reconcile the existing action before submitting another one.

---

## 12. Evidence and audit are first-class

Important business operations should leave evidence.

Where appropriate, preserve:

- who initiated it
- organization/entity
- capability used
- previous state
- requested change
- execution identity
- resulting state
- provider/job identity
- timestamps
- financial effect
- verification result
- relevant documents
- approval
- errors/uncertainty

Auditability should emerge naturally from the architecture rather than being added afterward.

---

## 13. Services and provider architecture

External providers must sit behind Avantiqo-owned service/runtime abstractions.

The business capability should not become directly coupled to one provider unless there is a compelling architectural reason.

Canonical commercial execution direction:

**request**
**→ determine capability/service**
**→ reserve wallet/resources where required**
**→ select approved runtime/provider**
**→ execute**
**→ capture supplier cost/usage**
**→ verify**
**→ calculate customer price**
**→ settle wallet**
**→ store evidence**

Provider replacement should not require rebuilding the business capability.

---

## 14. Owned AI engines

Core Avantiqo AI engines should increasingly be owned and controlled by Avantiqo where technically and economically sensible.

This includes the direction for:

- Intelligence
- Code
- Video
- Voice/Audio
- Image
- other strategic AI engines

Third-party systems may still be valuable for:

- specialist jobs
- fallback
- benchmarking
- temporary capability gaps
- economically superior workloads

But the architecture should not silently make Avantiqo completely dependent on a competitor for its core intelligence.

---

## 15. One execution path per capability

Avoid parallel implementations.

There should normally be one canonical production path for a capability.

For example:

Studio video generation should use the canonical Avantiqo Video capability/runtime.

Do not maintain:

- one Studio video generator
- another AI video endpoint
- another certification generator
- another manual production path

unless those genuinely represent different layers of the same architecture.

Testing and certification should exercise the real shared runtime wherever safely possible.

---

## 16. No duplicate infrastructure without evidence

Do not create duplicate:

- GPU endpoints
- network volumes
- caches
- databases
- queues
- provider integrations
- schedulers
- workers
- runtimes

merely to work around a temporary problem.

First determine why the existing architecture fails.

Duplicated infrastructure is allowed only where there is a demonstrated requirement such as:

- isolation
- availability
- scaling
- geography
- security
- materially better economics

and the architectural reason must be clear.

---

## 17. Database architecture

The database represents canonical business truth.

Requirements:

- organization scoping must be correct
- entity context must be correct where applicable
- relationships should model real business relationships
- lifecycle state should be explicit
- financial records must remain auditable
- duplicated sources of truth should be avoided
- schema should remain generic where generic business concepts exist

Do not introduce new tables merely because adding a table is easier than understanding the existing model.

First inspect the existing schema and capability model.

---

## 18. APIs

APIs should expose real platform capabilities and business resources.

They must respect:

- authentication
- organization context
- entity context where required
- permissions
- validation
- lifecycle rules
- audit/evidence requirements
- idempotency where required

Avoid hidden alternative business rules inside API routes.

Business rules should live in appropriate shared domain/runtime layers.

---

## 19. Frontend architecture

The UI is an interface to the business capability architecture.

It should not become the architecture itself.

Prefer shared:

- workspace renderers
- capability renderers
- table/data primitives
- action systems
- document interfaces
- navigation systems
- context selectors

over custom one-off pages for every new requirement.

However, reuse must not become an excuse for poor UX.

If an existing shared primitive prevents a world-class workflow, improve the primitive.

---

## 20. Creative Studio architecture

Studio is an intelligent production system, not merely a prompt interface.

Canonical direction:

**mission**
**→ business/brand context**
**→ brief**
**→ strategy**
**→ concept**
**→ storyboard**
**→ production plan**
**→ canonical AI capabilities**
**→ review/verification**
**→ final output/publication**

Users should not need to understand raw model prompts.

Studio should understand the creative goal and orchestrate Avantiqo capabilities.

---

## 21. Finance architecture

Finance must behave like a real professional accounting system.

It should preserve proper:

- ledgers
- journals
- periods
- dimensions
- posting
- reconciliation
- review
- approval
- evidence
- reporting
- audit trail

AI may assist Finance but cannot replace deterministic accounting integrity.

Important financial state changes should be governed and verifiable.

---

## 22. Operations architecture

Operations should use neutral business primitives.

Do not build "restaurant operations" into the fundamental architecture.

Instead model reusable concepts such as:

- location
- resource
- order
- service
- job
- task
- reservation
- schedule
- workstation
- fulfilment
- payment
- inventory
- asset
- customer interaction

Industries compose these primitives differently.

---

## 23. Documents are first-class business objects

Documents should not be treated merely as downloaded PDFs.

They may represent:

- invoices
- purchase orders
- quotations
- contracts
- certificates
- statements
- reports
- receipts
- approvals
- generated communication

Documents should connect to their underlying business records, lifecycle and evidence.

---

## 24. Events and automation

Important state changes should be capable of driving automation.

Think in terms of:

**business event → rule/intelligence → capability/action → verification**

rather than forcing everything through manual polling and scheduled scripts.

Where an event-driven architecture is materially better, prefer it.

---

## 25. Performance is architectural

Speed is not something added after development.

For important workflows, architecture should consider:

- network round trips
- unnecessary database calls
- model cold starts
- repeated inference
- serialization
- caching
- precomputation
- parallelism
- streaming
- event-driven execution
- compiled execution
- GPU retention where economical
- unnecessary framework overhead

A correct architecture that is unnecessarily slow is not finished.

---

## 26. Cost is architectural

Avantiqo should understand the cost of execution.

Especially for AI:

- do not execute expensive models unnecessarily
- reuse deterministic results where valid
- use caching where safe
- select appropriate hardware
- scale expensive infrastructure to zero when idle where sensible
- separate expensive reasoning from simple execution
- measure supplier cost
- optimize cost per successful business outcome

Lowest cost is not always the objective.

The objective is the **best result per total cost**.

---

## 27. Security and authorization

Intelligence does not bypass authorization.

Automation does not bypass authorization.

Convenience does not bypass authorization.

Capabilities should have clear authorization boundaries.

AI may reason freely about permitted context, but execution must respect the same or stronger governance as a human action.

---

## 28. Certification before claims

For important systems, distinguish:

- implemented
- connected
- tested
- end-to-end verified
- production certified

Do not collapse these into "done."

Whenever possible, certification should prove the actual production runtime contract.

---

## 29. Main is technical truth

GitHub repository:

`churchillkaron/churchill-control-new`

Canonical branch:

`main`

Before substantial code changes:

1. inspect/fetch newest `main`
2. determine what currently exists
3. verify recent parallel work
4. modify the existing architecture
5. test
6. certify where appropriate

Do not reconstruct system state from old ChatGPT conversations when current `main` can answer the question.

Chat history is orientation.

**Current code and runtime evidence are authoritative.**

---

## 30. Architecture can evolve

These rules protect coherence, not stagnation.

Do not preserve an existing architecture simply because it already exists.

If research, benchmarking, operating evidence or a new invention demonstrates that a fundamentally better architecture exists:

**investigate it → prototype it → compare it → prove it → migrate deliberately**

Avantiqo must remain capable of architectural invention.

Never interpret "canonical architecture" as:

"never change anything."

Interpret it as:

**one coherent architecture at a time, changed deliberately when evidence proves something better.**

---

# Final architecture principle

For every significant change, ask:

**Does this make Avantiqo one stronger platform, or does it create another isolated piece?**

Prefer:

**shared primitives over duplication**
**capabilities over CRUD**
**business reality over screens**
**organization/entity/party over tenant**
**generic architecture over industry hardcoding**
**one canonical runtime over parallel implementations**
**deterministic verification over assumptions**
**real execution over demos**
**evidence over claims**
**intelligence plus speed over unnecessary complexity**
**research and invention over blindly following standard practice**

The architecture exists to make Avantiqo capable of becoming **more intelligent, faster, simpler, more autonomous and more powerful than conventional ERP and AI platforms — without sacrificing correctness, governance or coherence.**
