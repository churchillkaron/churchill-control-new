from pathlib import Path


def replace_exact(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    content = file_path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}")
    file_path.write_text(content.replace(old, new), encoding="utf-8")


SHOT = "lib/creative/director/runtime/CreativeShotDirectorRuntime.js"
JOB = "lib/creative/director/runtime/CreativeDirectorJobRuntime.js"

replace_exact(
    SHOT,
    '''import {\n  resolveCreativeFreedomPolicy,\n} from "./CreativeFreedomPolicyRuntime";\n''',
    '''import {\n  resolveCreativeFreedomPolicy,\n} from "./CreativeFreedomPolicyRuntime";\n\nimport {\n  compileCreativeProductionSpecification,\n  assertCreativePlanMatchesProductionSpecification,\n} from "@/lib/creative/production/contracts/CreativeProductionSpecification";\n''',
)

replace_exact(
    SHOT,
    '''    budgetMode = "quality-first",\n  } = {}) {\n''',
    '''    budgetMode = "quality-first",\n    productionSpecification = null,\n  } = {}) {\n''',
)

replace_exact(
    SHOT,
    '''    const input = {\n      organization_id,\n      organization,\n      brand,\n      industry,\n      objective,\n      brief,\n      assets: evidenceAssets,\n      requested_outputs: requestedOutputs,\n      target_duration_seconds: targetDuration,\n      platform,\n      budget_mode: budgetMode,\n      creative_policy: freedom,\n    };\n    const first = await directOnce({ input, freedom });\n\n    try {\n      return normalizePlan({\n        result: first?.result,\n        reasoning: first,\n        objective,\n        brief,\n        assets: evidenceAssets,\n        durationSeconds: targetDuration,\n        freedom,\n      });\n''',
    '''    const specification =\n      compileCreativeProductionSpecification({\n        organization_id,\n        input: {\n          organization,\n          brand,\n          industry,\n          objective,\n          brief,\n          requested_outputs: requestedOutputs,\n          target_duration_seconds: targetDuration,\n          platform,\n          budget_mode: budgetMode,\n          production_specification:\n            productionSpecification,\n        },\n        assets: evidenceAssets,\n        existing: productionSpecification,\n      });\n    const input = {\n      organization_id,\n      organization,\n      brand,\n      industry,\n      objective,\n      brief,\n      assets: evidenceAssets,\n      requested_outputs: requestedOutputs,\n      target_duration_seconds: targetDuration,\n      platform,\n      budget_mode: budgetMode,\n      creative_policy: freedom,\n      production_specification:\n        specification,\n    };\n    const first = await directOnce({ input, freedom });\n\n    try {\n      const plan = normalizePlan({\n        result: first?.result,\n        reasoning: first,\n        objective,\n        brief,\n        assets: evidenceAssets,\n        durationSeconds: targetDuration,\n        freedom,\n      });\n\n      const report =\n        assertCreativePlanMatchesProductionSpecification({\n          plan,\n          specification,\n        });\n\n      return {\n        ...plan,\n        production_specification:\n          specification,\n        metadata: {\n          ...object(plan.metadata),\n          production_specification_key:\n            specification.specification_key,\n          production_specification_report:\n            report,\n        },\n      };\n''',
)

replace_exact(
    SHOT,
    '''      return normalizePlan({\n        result: repaired?.result,\n        reasoning: repaired,\n        objective,\n        brief,\n        assets: evidenceAssets,\n        durationSeconds: targetDuration,\n        freedom,\n        repairApplied: true,\n      });\n''',
    '''      const plan = normalizePlan({\n        result: repaired?.result,\n        reasoning: repaired,\n        objective,\n        brief,\n        assets: evidenceAssets,\n        durationSeconds: targetDuration,\n        freedom,\n        repairApplied: true,\n      });\n\n      const report =\n        assertCreativePlanMatchesProductionSpecification({\n          plan,\n          specification,\n        });\n\n      return {\n        ...plan,\n        production_specification:\n          specification,\n        metadata: {\n          ...object(plan.metadata),\n          production_specification_key:\n            specification.specification_key,\n          production_specification_report:\n            report,\n        },\n      };\n''',
)

replace_exact(
    JOB,
    '''import {\n  inspectCreativeShotTemporalContract,\n} from "./CreativeShotTemporalContract";\n''',
    '''import {\n  inspectCreativeShotTemporalContract,\n} from "./CreativeShotTemporalContract";\n\nimport {\n  compileCreativeProductionSpecification,\n  assertCreativePlanMatchesProductionSpecification,\n} from "@/lib/creative/production/contracts/CreativeProductionSpecification";\n''',
)

replace_exact(
    JOB,
    '''    const manifest = assetManifest(assets);\n    const { data: job, error } = await supabaseAdmin\n''',
    '''    const manifest = assetManifest(assets);\n    const productionSpecification =\n      compileCreativeProductionSpecification({\n        organization_id,\n        input: input_snapshot,\n        assets: manifest,\n        existing:\n          input_snapshot.production_specification,\n      });\n    const { data: job, error } = await supabaseAdmin\n''',
)

replace_exact(
    JOB,
    '''          fps: Number(input_snapshot.fps || 30),\n        },\n''',
    '''          fps: Number(\n            input_snapshot.fps ||\n            productionSpecification.fps ||\n            30,\n          ),\n          production_specification:\n            productionSpecification,\n        },\n''',
)

replace_exact(
    JOB,
    '''          budgetMode: input.budget_mode || "quality-first",\n        });\n        assertCanonicalReferences(plan, assets, definition.key);\n''',
    '''          budgetMode: input.budget_mode || "quality-first",\n          productionSpecification:\n            input.production_specification,\n        });\n        assertCanonicalReferences(plan, assets, definition.key);\n        const specificationReport =\n          assertCreativePlanMatchesProductionSpecification({\n            plan,\n            specification:\n              input.production_specification,\n          });\n''',
)

replace_exact(
    JOB,
    '''          timeout_ms: definition.timeoutMs,\n        };\n''',
    '''          timeout_ms: definition.timeoutMs,\n        };\n        metrics = {\n          production_specification_key:\n            input.production_specification\n              ?.specification_key || null,\n          production_specification_report:\n            specificationReport,\n        };\n''',
)
