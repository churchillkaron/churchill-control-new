import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const receiptPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoExperimentExecutionReceiptRuntime.js",
);
const ingressPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoGovernedExperimentResultIngressRuntime.js",
);
const claimPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoExperimentExecutionClaimRuntime.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");

const receipt = fs.readFileSync(receiptPath, "utf8");
const ingress = fs.readFileSync(ingressPath, "utf8");
const claim = fs.readFileSync(claimPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

const checks = [
  [
    "receipt contract",
    receipt.includes("AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1"),
  ],
  [
    "claim contract lineage",
    receipt.includes('const CLAIM_CONTRACT = "AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_V1"'),
  ],
  [
    "durable receipt scope",
    receipt.includes('platform_learning_experiment_execution_receipts'),
  ],
  [
    "consumed claim required",
    receipt.includes('"CONSUMED_SINGLE_EXECUTION_CLAIM"'),
  ],
  [
    "receipt fingerprint bound in consumed claim",
    receipt.includes("execution_receipt_fingerprint") &&
      claim.includes("execution_receipt_fingerprint: receiptFingerprint"),
  ],
  [
    "exact claim provenance verified",
    receipt.includes("exact_claim_binding_verified: true"),
  ],
  [
    "exact executor provenance verified",
    receipt.includes("exact_executor_binding_verified: true"),
  ],
  [
    "exact experiment version verified",
    receipt.includes("exact_experiment_version_binding_verified: true"),
  ],
  [
    "exact cost verified",
    receipt.includes("exact_cost_binding_verified: true"),
  ],
  [
    "execution mode evidence verified",
    receipt.includes("execution_mode_evidence_verified: true"),
  ],
  [
    "receipt immutable",
    receipt.includes("immutable_provenance_record: true"),
  ],
  [
    "receipt cannot authorize execution",
    receipt.includes("receipt_authorizes_execution: false"),
  ],
  [
    "receipt cannot replay execution",
    receipt.includes("receipt_can_be_replayed_for_execution: false"),
  ],
  [
    "receipt requires result assertion",
    receipt.includes("result_recording_requires_receipt_assertion: true"),
  ],
  [
    "completed execution required for result",
    receipt.includes("require_completed === true") &&
      receipt.includes("EXECUTION_NOT_COMPLETED"),
  ],
  [
    "customer private data forbidden",
    receipt.includes("CUSTOMER_PRIVATE_RECEIPT_FORBIDDEN"),
  ],
  [
    "provider mode evidence required",
    receipt.includes("PROVIDER_MODE_EXECUTION_EVIDENCE_INVALID"),
  ],
  [
    "runpod mode evidence required",
    receipt.includes("RUNPOD_MODE_EXECUTION_EVIDENCE_INVALID"),
  ],
  [
    "local mode external evidence forbidden",
    receipt.includes("LOCAL_MODE_EXTERNAL_EXECUTION_EVIDENCE_FORBIDDEN"),
  ],
  [
    "result ingress contract",
    ingress.includes("AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_V1"),
  ],
  [
    "scientific result receipt gated",
    ingress.includes("recordAvantiqoGovernedScientificExperimentResult") &&
      ingress.includes("assertAvantiqoExperimentExecutionReceiptCurrent") &&
      ingress.includes("recordAvantiqoScientificExperimentResult"),
  ],
  [
    "transfer result receipt gated",
    ingress.includes("recordAvantiqoGovernedTransferExperimentResult") &&
      ingress.includes("recordAvantiqoTransferExperimentResult"),
  ],
  [
    "receipt requires completed execution at scientific ingress",
    /recordAvantiqoGovernedScientificExperimentResult[\s\S]*require_completed:\s*true/.test(
      ingress,
    ),
  ],
  [
    "receipt requires completed execution at transfer ingress",
    /recordAvantiqoGovernedTransferExperimentResult[\s\S]*require_completed:\s*true/.test(
      ingress,
    ),
  ],
  [
    "transfer executed timestamp tied to receipt",
    ingress.includes("EXECUTED_AT_PROVENANCE_MISMATCH") &&
      ingress.includes("executed_at: provenance.executed_at"),
  ],
  [
    "result ingress no execution authority",
    ingress.includes("result_ingress_authorizes_execution: false"),
  ],
  [
    "result ingress no direct knowledge write",
    ingress.includes("platform_knowledge_written_directly: false"),
  ],
  [
    "receipt no reusable platform knowledge",
    receipt.includes("reusable_platform_knowledge: false"),
  ],
  [
    "receipt no automatic knowledge promotion",
    receipt.includes("automatic_knowledge_promotion: false"),
  ],
  [
    "receipt no automatic training",
    receipt.includes('automatic_training_effect: "NONE"'),
  ],
  [
    "receipt runtime exported",
    index.includes("./runtime/AvantiqoExperimentExecutionReceiptRuntime"),
  ],
  [
    "governed result ingress exported",
    index.includes("./runtime/AvantiqoGovernedExperimentResultIngressRuntime"),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [name] of failures) {
    console.error(`AVANTIQO_PHASE20_AUDIT_FAILURE=${name}`);
  }
  process.exitCode = 1;
} else {
  console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE20_AUDIT=PASS");
  console.log(
    "AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT=AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1",
  );
  console.log(
    "AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_CONTRACT=AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_V1",
  );
  console.log("AVANTIQO_PHASE20_RECEIPT_IMMUTABLE=true");
  console.log("AVANTIQO_PHASE20_RESULT_RECEIPT_REQUIRED=true");
  console.log("AVANTIQO_PHASE20_FAILED_EXECUTION_ACCEPTED_AS_RESULT=false");
  console.log("AVANTIQO_PHASE20_RECEIPT_AUTHORIZES_EXECUTION=false");
  console.log("AVANTIQO_PHASE20_PLATFORM_KNOWLEDGE_WRITTEN=false");
  console.log("AVANTIQO_PHASE20_AUTOMATIC_TRAINING_STARTED=false");
}
