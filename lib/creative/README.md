# VIDEO DOMAIN

Video is a first-class ERP domain.

Consumers:
- Marketing
- Sales
- HR
- Website Builder
- Design Studio
- AI Agents

Bounded Contexts

Projects
Research
Direction
Production
Rendering
Quality
Assets
Publishing
Analytics

Rules

- Every bounded context owns exactly one root business document.
- Every bounded context has its own documents, repositories, services, runtime and ui.
- Only Rendering may communicate with external AI/video providers.
- Only Research and Direction may use reasoning models.
- Production is deterministic.
- Everything belongs to a Video Project.
