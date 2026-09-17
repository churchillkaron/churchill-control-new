import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_GENERAL_INTELLIGENCE_CURRICULUM_CONTRACT =
  "AVANTIQO_GENERAL_INTELLIGENCE_CURRICULUM_V1";

const MEMORY_TABLE = "intelligence_memories";
const AGENDA_SCOPE = "platform_learning_agenda";
const EXAM_SCOPE = "platform_general_intelligence_exams";
const RETENTION_SCOPE = "platform_general_intelligence_retention";
const DAY_MS = 86_400_000;

const WORLD_CURRICULUM = Object.freeze([
  ["economics-business", "economics", "Study durable principles of microeconomics, macroeconomics, incentives, market structure, pricing, capital allocation, business strategy and decision-making under uncertainty. Prefer central banks, statistical agencies, universities, peer-reviewed research and primary standards; separate settled principles from contested interpretations."],
  ["accounting-finance", "accounting", "Study general accounting and finance foundations: financial statements, double-entry mechanics, cash flow, working capital, valuation, internal controls, audit evidence, management accounting and major reporting concepts. Prefer IFRS Foundation, accounting standard setters, regulators, universities and primary professional guidance."],
  ["hospitality-operations", "hospitality", "Study restaurant, hotel and hospitality operations: service design, revenue management, food cost, yield, labor planning, inventory, guest experience, safety, quality systems and operational metrics. Prefer universities, recognized industry bodies, government safety guidance and primary operational research."],
  ["software-engineering", "software-engineering", "Study modern software engineering: distributed systems, databases, API design, reliability, testing, security, observability, performance, architecture, concurrency and failure recovery. Prefer RFCs, standards bodies, official project documentation, peer-reviewed systems research and primary engineering sources."],
  ["mathematics-logic", "mathematics", "Study mathematics and formal reasoning: algebra, calculus, linear algebra, discrete mathematics, optimization, proof methods, numerical reasoning and logic. Prefer rigorous university texts, mathematical societies and primary references; distinguish proof from empirical evidence."],
  ["statistics-probability", "statistics", "Study probability, statistics, causal inference, experimental design, forecasting, Bayesian reasoning, uncertainty calibration, sampling, measurement and common statistical failure modes. Prefer textbooks from reputable universities, statistical agencies and peer-reviewed methodological research."],
  ["physics-mechanics", "physics", "Study mechanics, energy, thermodynamics, electromagnetism, waves, materials and measurement. Emphasize physical constraints, conservation laws, dimensional analysis, uncertainty and experimentally validated models."],
  ["chemistry-materials", "chemistry", "Study chemical principles, reactions, materials, thermodynamics, kinetics, safety and industrial chemistry literacy. Prefer scientific societies, universities, safety authorities and peer-reviewed primary sources."],
  ["biology-life-science", "biology", "Study biology, ecology, genetics, physiology, evolution, microbiology and systems biology. Prefer scientific societies, universities, public-health institutions and peer-reviewed research; distinguish mechanisms from correlation."],
  ["health-medical-literacy", "health-literacy", "Study general health and medical literacy: anatomy, physiology, epidemiology, diagnostics evidence, treatment evidence, public health and clinical uncertainty. Prefer health authorities, systematic reviews and peer-reviewed clinical evidence; do not substitute general knowledge for professional diagnosis or treatment."],
  ["engineering-systems", "engineering", "Study mechanical, electrical, civil and industrial engineering foundations: requirements, tolerances, reliability, safety factors, energy, materials, manufacturing, maintainability and failure analysis. Prefer standards, engineering societies, universities and primary technical documentation."],
  ["control-systems", "control-systems", "Study feedback, control theory, state estimation, stability, signal processing, sensor uncertainty, automation and cyber-physical systems. Prefer engineering texts, IEEE/IEC standards and peer-reviewed controls research."],
  ["information-theory-computation", "information-theory", "Study computation, algorithms, complexity, information theory, compression, coding, networks and limits of computation. Prefer foundational papers, university texts, standards and reproducible systems research."],
  ["science-method", "science", "Study scientific reasoning: hypothesis formation, measurement, falsifiability, experimental design, replication, causal identification, model selection, uncertainty and evidence quality across disciplines."],
  ["law-regulation-literacy", "law-regulation", "Study jurisdiction-neutral legal and regulatory reasoning: contracts, evidence, corporate obligations, privacy, consumer protection, employment concepts, taxation concepts and regulatory interpretation. Prefer statutes, regulators, courts and official guidance; never generalize a jurisdiction-specific rule without labeling jurisdiction and date."],
  ["cybersecurity", "cybersecurity", "Study cybersecurity foundations: threat modeling, authentication, authorization, cryptography, secure software design, incident response, network security, supply-chain risk and privacy engineering. Prefer NIST, CISA, OWASP, IETF/RFCs, standards bodies and peer-reviewed security research."],
  ["decision-psychology", "decision-science", "Study decision science and psychology relevant to judgment: cognitive biases, behavioral economics, motivation, group decision-making, negotiation, learning, human factors and organizational behavior. Prefer peer-reviewed research, meta-analyses and reputable academic sources; distinguish robust findings from weak or disputed effects."],
  ["communication-negotiation", "communication", "Study professional communication, negotiation, interviewing, persuasion literacy, conflict resolution, teaching and explanation. Prefer evidence-based negotiation research, universities and primary research; distinguish ethical communication from manipulation."],
  ["language-writing-logic", "language", "Study language, semantics, rhetoric, technical writing, translation, argument structure and ambiguity resolution. Emphasize clear communication, logical validity, audience adaptation and faithful preservation of meaning."],
  ["operations-supply-chain", "operations", "Study operations research and supply chain foundations: queuing, capacity, inventory, procurement, logistics, quality, scheduling, optimization, bottlenecks, resilience and service levels. Prefer standards bodies, universities, government logistics guidance and peer-reviewed operations research."],
  ["strategy-game-theory", "strategy", "Study competitive strategy, game theory, mechanism design, incentives, bargaining, portfolio choices, scenario planning and strategic uncertainty. Prefer rigorous economic, mathematical and management research; separate descriptive models from normative recommendations."],
  ["product-design", "product-design", "Study product management, user research, service design, interaction design, accessibility, systems thinking, experimentation and product quality. Prefer standards, human-computer interaction research and evidence from controlled product experiments."],
  ["creative-media", "creative", "Study visual design, cinematography, photography, music, audio, storytelling, editing, typography, motion, advertising craft and media production. Separate subjective taste from measurable craft, continuity, physical plausibility, audience comprehension and production constraints."],
  ["marketing-consumer", "marketing", "Study marketing, positioning, brand, customer research, pricing psychology, acquisition, retention, attribution and experimentation. Prefer empirical marketing research, platform documentation and measured outcomes; avoid manipulative persuasion."],
  ["history-geography", "history-geography", "Study world history, economic history, geography, demographics, institutions, infrastructure and regional context. Prefer primary historical sources, reputable scholarship and official statistics; distinguish historical evidence from modern inference."],
  ["civics-geopolitics", "civics-geopolitics", "Study institutions, international relations, trade, public policy, elections and geopolitical systems neutrally and factually. Prefer official institutions, treaties, election authorities, statistical agencies and diverse high-quality scholarship; preserve uncertainty and competing interpretations without political advocacy."],
  ["research-information-literacy", "research", "Study research methods, source evaluation, information retrieval, bibliographic reasoning, provenance, misinformation detection, synthesis and evidence auditing. Prefer primary sources and explicit source-quality comparisons."],
  ["ai-machine-learning", "ai-ml", "Study current AI and machine-learning foundations: representation learning, transformers, inference, evaluation, retrieval, agents, reinforcement learning, fine-tuning, distillation, calibration, safety and efficient serving. Prefer original papers, official model/system documentation and reproducible benchmarks; freshness is critical."],
]);

function text(value, limit = 12000) { return String(value ?? "").trim().slice(0, limit); }
function hash(value) { return createHash("sha256").update(String(value)).digest("hex").slice(0, 40); }
function learningOrganizationId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160); }
function utcDayNumber(now = Date.now()) { return Math.floor(now / DAY_MS); }

function agendaRow({ organizationId, item, index, activeIndex, nowMs, exam = null, retention = null }) {
  const [key, domain, query] = item;
  const isActive = index === activeIndex;
  const examMeta = exam && typeof exam.metadata === "object" ? exam.metadata : {};
  const weaknessScore = Math.max(0, Math.min(1, Number(examMeta.weakness_score || 0)));
  const retentionMeta = retention && typeof retention.metadata === "object" ? retention.metadata : {};
  const forgettingScore = Math.max(0, Math.min(1, Number(retentionMeta.forgetting_score || 0)));
  const examPassed = examMeta.passed === true;
  const practiceDue = (!examPassed && weaknessScore >= 0.2) || forgettingScore >= 0.12;
  const rotationDueMs = nowMs + ((index - activeIndex + WORLD_CURRICULUM.length) % WORLD_CURRICULUM.length) * DAY_MS;
  const due = (isActive || practiceDue) ? new Date(nowMs).toISOString() : new Date(rotationDueMs).toISOString();
  const adaptiveImportance = practiceDue ? Math.min(0.97, 0.72 + Math.max(weaknessScore, forgettingScore) * 0.25) : 0.58;
  const mutable = new Set(["law-regulation", "cybersecurity", "ai-ml", "software-engineering"]).has(domain);
  return {
    organization_id: organizationId, party_id: null, entity_id: null, conversation_id: null, source_turn_id: null,
    memory_scope: AGENDA_SCOPE, memory_key: `agenda:${hash(`world:${key}`)}`, memory_type: "goal", subject: `world-${key}`,
    content: query, importance: isActive ? 0.995 : adaptiveImportance, confidence: 1, source: "general_intelligence_curriculum", active: true,
    valid_until: null, superseded_by: null, superseded_at: null, forgotten_at: null,
    metadata: {
      contract: AVANTIQO_GENERAL_INTELLIGENCE_CURRICULUM_CONTRACT,
      continuous_learning: true, general_intelligence_curriculum: true, education_scope: "WORLD_KNOWLEDGE",
      topic_key: `world-${key}`, knowledge_domain: domain, jurisdiction: null,
      stability: mutable ? "mutable" : "stable", freshness_days: mutable ? 60 : 365,
      review_interval_days: mutable ? 45 : 180, preferred_domains: [], status: "READY", next_research_at: due,
      failure_count: 0, lease_token: null, lease_expires_at: null, parent_topic_key: null,
      rotation_slot: index, rotation_size: WORLD_CURRICULUM.length,
      adaptive_practice_due: practiceDue,
      latest_exam_score: Number.isFinite(Number(examMeta.score)) ? Number(examMeta.score) : null,
      latest_exam_weakness_score: weaknessScore,
      latest_exam_passed: examPassed,
      latest_retention_score: Number.isFinite(Number(retentionMeta.score)) ? Number(retentionMeta.score) : null,
      latest_forgetting_score: forgettingScore,
      retention_mastery_candidate: retentionMeta.mastery_candidate === true,
      trusted_source_policy: "PRIMARY_AUTHORITATIVE_OR_PEER_REVIEWED_PREFERRED",
      source_diversity_required: true, contested_claims_must_be_labeled: true,
      current_claims_require_freshness: true, automatic_knowledge_promotion: false,
      explicit_final_promotion_required: true, automatic_model_training: false,
      automatic_model_promotion: false, customer_private_content_allowed: false,
      created_by: "general_intelligence_curriculum",
    }, updated_at: new Date(nowMs).toISOString(),
  };
}

export async function reconcileAvantiqoGeneralIntelligenceCurriculum({ now = new Date() } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) return { success: true, status: "DISABLED", reason: "LEARNING_ORGANIZATION_ID_REQUIRED" };
  const nowMs = now.getTime();
  const activeIndex = utcDayNumber(nowMs) % WORLD_CURRICULUM.length;
  const examRows = await supabaseAdmin.from(MEMORY_TABLE)
    .select("subject,metadata,updated_at")
    .eq("organization_id", organizationId).eq("memory_scope", EXAM_SCOPE)
    .eq("active", true).order("updated_at", { ascending: false }).limit(200);
  if (examRows.error) throw examRows.error;
  const latestExamByTopic = new Map();
  for (const row of examRows.data || []) {
    if (!latestExamByTopic.has(row.subject)) latestExamByTopic.set(row.subject, row);
  }
  const retentionRows = await supabaseAdmin.from(MEMORY_TABLE)
    .select("subject,metadata,updated_at")
    .eq("organization_id", organizationId).eq("memory_scope", RETENTION_SCOPE)
    .eq("active", true).order("updated_at", { ascending: false }).limit(500);
  if (retentionRows.error) throw retentionRows.error;
  const latestRetentionByTopic = new Map();
  for (const row of retentionRows.data || []) {
    if (!latestRetentionByTopic.has(row.subject)) latestRetentionByTopic.set(row.subject, row);
  }
  const rows = WORLD_CURRICULUM.map((item, index) => {
    const topic = `world-${item[0]}`;
    return agendaRow({ organizationId, item, index, activeIndex, nowMs, exam: latestExamByTopic.get(topic) || null, retention: latestRetentionByTopic.get(topic) || null });
  });
  const existing = await supabaseAdmin.from(MEMORY_TABLE)
    .select("id,memory_key,metadata,importance,updated_at")
    .eq("organization_id", organizationId).eq("memory_scope", AGENDA_SCOPE)
    .eq("source", "general_intelligence_curriculum").limit(100);
  if (existing.error) throw existing.error;
  const byKey = new Map((existing.data || []).map((row) => [row.memory_key, row]));
  let inserted = 0, updated = 0;
  for (const row of rows) {
    const current = byKey.get(row.memory_key);
    if (!current) {
      const result = await supabaseAdmin.from(MEMORY_TABLE).insert(row).select("id").single();
      if (result.error) throw result.error; inserted += 1; continue;
    }
    const currentMeta = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const next = { ...currentMeta, ...row.metadata,
      last_researched_at: currentMeta.last_researched_at || null,
      last_claim_count: Number(currentMeta.last_claim_count || 0),
      last_source_count: Number(currentMeta.last_source_count || 0),
      last_uncertainty_count: Number(currentMeta.last_uncertainty_count || 0),
    };
    const result = await supabaseAdmin.from(MEMORY_TABLE)
      .update({ content: row.content, importance: row.importance, metadata: next, updated_at: row.updated_at })
      .eq("organization_id", organizationId).eq("id", current.id);
    if (result.error) throw result.error; updated += 1;
  }
  const active = rows[activeIndex];
  return { success: true, status: "CURRICULUM_READY", contract: AVANTIQO_GENERAL_INTELLIGENCE_CURRICULUM_CONTRACT,
    domain_count: rows.length, active_rotation_slot: activeIndex, active_topic_key: active.metadata.topic_key,
    active_domain: active.metadata.knowledge_domain, inserted_count: inserted, updated_count: updated,
    adaptive_practice_topic_count: rows.filter((row) => row.metadata.adaptive_practice_due === true).length,
    automatic_model_training: false, automatic_model_promotion: false, explicit_final_knowledge_promotion_required: true };
}

export const AvantiqoGeneralIntelligenceCurriculumRuntime = Object.freeze({
  contract: AVANTIQO_GENERAL_INTELLIGENCE_CURRICULUM_CONTRACT,
  domains: WORLD_CURRICULUM.map(([key, domain]) => ({ key, domain })),
  reconcile: reconcileAvantiqoGeneralIntelligenceCurriculum,
});
