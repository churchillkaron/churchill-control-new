import { deriveCodeAICausalGraph } from "./CodeAIWorldClassIntelligenceRuntime.js";
import { analyzeCodeAISourceDependencies } from "./CodeAISyntaxAwareDependencyRuntime.js";
import { buildCodeAITypeScriptCompilerContracts, CODE_AI_TYPESCRIPT_COMPILER_CONTRACT } from "./CodeAITypeScriptCompilerContractRuntime.js";

export const CODE_AI_OBSERVED_CONTRACT_GUARD = "AVANTIQO_CODE_AI_OBSERVED_CONTRACT_GUARD_V2";

const ROUTE_HANDLER = /(^|\/)app\/.*\/route\.(?:js|jsx|ts|tsx)$/i;
const HTTP_EXPORTS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const TEST_PATH = /(^|\/)(?:__tests__|tests?|specs?|e2e)(\/|$)|\.(?:test|spec)\.[^/]+$/i;

function text(value, maximum = 1200) { return String(value ?? "").trim().slice(0, maximum); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function unique(values) { return [...new Set(values.map((item) => text(item, 1200)).filter(Boolean))]; }
function observedReadContent(state, path) {
  const entries = [...list(state?.declared_evidence_reads), ...list(state?.source_read_evidence), ...list(state?.evidence)];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (text(entry?.action, 80) !== "read" || text(entry?.status, 80) !== "completed") continue;
    const result = entry?.result || {};
    if (text(result.file_path || result.path, 1200) !== path) continue;
    const content = String(result.content ?? "");
    if (content) return content;
  }
  return null;
}

function writeMap(writes) {
  return new Map(list(writes).map((item) => [text(item?.path, 1200), String(item?.content ?? "")]).filter(([path]) => path));
}
function afterCallsFromCaller(after, caller, provider) {
  return list(after?.edges).filter((edge) =>
    edge?.from === caller && edge?.to === provider && edge?.relation === "calls_imported_symbol"
  );
}
function afterResultReadsFromCaller(after, caller, provider) {
  return list(after?.edges).filter((edge) =>
    edge?.from === caller && edge?.to === provider && edge?.relation === "reads_imported_result_field"
  );
}
function coherentSymbolMigration({ beforeEntry, after, providerPath, oldSymbol, afterExports, writesByPath }) {
  const callers = unique(list(beforeEntry?.observed_symbol_calls)
    .filter((call) => text(call?.target_symbol, 240) === oldSymbol)
    .map((call) => call?.caller));
  if (!callers.length || callers.some((caller) => !writesByPath.has(caller))) return null;
  const replacements = callers.map((caller) => {
    const targets = unique(afterCallsFromCaller(after, caller, providerPath).map((edge) => edge?.target_symbol));
    return targets.length === 1 ? { caller, symbol: targets[0] } : null;
  });
  if (replacements.some((item) => !item)) return null;
  const symbols = unique(replacements.map((item) => item.symbol));
  if (symbols.length !== 1 || symbols[0] === oldSymbol || !afterExports.has(symbols[0])) return null;
  return {
    kind: "COHERENT_IMPORTED_SYMBOL_MIGRATION",
    path: providerPath,
    from_symbol: oldSymbol,
    to_symbol: symbols[0],
    migrated_callers: callers,
  };
}
function impactedVerifierPaths(graph, changedPaths) {
  const changed = new Set(changedPaths);
  const reverse = new Map();
  for (const edge of list(graph?.edges)) {
    const dependency = text(edge?.to, 1200);
    const consumer = text(edge?.from, 1200);
    if (!dependency || !consumer) continue;
    const values = reverse.get(dependency) || [];
    if (!values.includes(consumer)) values.push(consumer);
    reverse.set(dependency, values);
  }
  const found = new Set();
  const queue = [...changed].map((path) => ({ path, depth: 0 }));
  const seen = new Set(changed);
  while (queue.length && seen.size <= 120) {
    const current = queue.shift();
    if (current.depth >= 3) continue;
    for (const consumer of list(reverse.get(current.path))) {
      if (TEST_PATH.test(consumer)) found.add(consumer);
      if (!seen.has(consumer) && !TEST_PATH.test(consumer)) {
        seen.add(consumer);
        queue.push({ path: consumer, depth: current.depth + 1 });
      }
    }
  }
  return [...found].sort().slice(0, 12);
}



function propertyMap(properties) {
  return new Map(list(properties).map((item) => [text(item?.name, 240), item]).filter(([name]) => name));
}

function compareTypeProperties({ path, symbol, scope, beforeProperties, afterProperties, obligations, violations }) {
  const beforeMap = propertyMap(beforeProperties);
  const afterMap = propertyMap(afterProperties);
  for (const [property, prior] of beforeMap.entries()) {
    obligations.push({ path, kind: `${scope}_PROPERTY`, symbol, property, optional: prior?.optional === true });
    const proposed = afterMap.get(property);
    if (!proposed) {
      violations.push({ path, kind: `${scope}_PROPERTY_REMOVED`, symbol, property });
      continue;
    }
    if (scope === "TS_EXPORTED_TYPE" && (prior?.optional === true) !== (proposed?.optional === true)) {
      violations.push({ path, kind: "TS_EXPORTED_TYPE_PROPERTY_OPTIONALITY_CHANGED", symbol, property, was_optional: prior?.optional === true, proposed_optional: proposed?.optional === true });
    }
    if (scope === "TS_PARAMETER" && prior?.optional === true && proposed?.optional !== true) {
      violations.push({ path, kind: "TS_PARAMETER_OPTIONAL_PROPERTY_TIGHTENED", symbol, property });
    }
    if (scope === "TS_RETURN" && prior?.optional !== true && proposed?.optional === true) {
      violations.push({ path, kind: "TS_RETURN_REQUIRED_PROPERTY_WEAKENED", symbol, property });
    }
  }
}

function matchingSchema(analysis, kind, name) {
  return list(analysis?.schema_references).find((item) =>
    text(item?.kind, 80) === kind && text(item?.name, 500) === name
  ) || null;
}


function compilerPropertyMap(properties) {
  return new Map(list(properties).map((item) => [text(item?.name, 240), item]).filter(([name]) => name));
}
function compareCompilerProperties({ path, symbol, scope, beforeProperties, afterProperties, violations, obligations }) {
  const after = compilerPropertyMap(afterProperties);
  for (const prior of list(beforeProperties)) {
    const property = text(prior?.name, 240);
    if (!property) continue;
    obligations.push({ path, kind: `TS_COMPILER_${scope}_PROPERTY`, symbol, property, optional: prior?.optional === true });
    const proposed = after.get(property);
    if (!proposed) {
      violations.push({ path, kind: `TS_COMPILER_${scope}_PROPERTY_REMOVED`, symbol, property });
      continue;
    }
    if ((scope === "EXPORTED_TYPE") && (prior?.optional === true) !== (proposed?.optional === true)) {
      violations.push({ path, kind: "TS_COMPILER_EXPORTED_TYPE_PROPERTY_OPTIONALITY_CHANGED", symbol, property, was_optional: prior?.optional === true, proposed_optional: proposed?.optional === true });
    }
    if (scope === "PARAMETER" && prior?.optional === true && proposed?.optional !== true) {
      violations.push({ path, kind: "TS_COMPILER_PARAMETER_OPTIONAL_PROPERTY_TIGHTENED", symbol, property });
    }
    if (scope === "RETURN" && prior?.optional !== true && proposed?.optional === true) {
      violations.push({ path, kind: "TS_COMPILER_RETURN_REQUIRED_PROPERTY_WEAKENED", symbol, property });
    }
  }
}
function applyCompilerContractCompatibility({ compiler, violations, obligations }) {
  if (!compiler?.active || compiler?.before?.clean !== true || compiler?.after?.clean !== true) {
    return { enforced: false, reason: !compiler?.active ? compiler?.reason || "INACTIVE" : "COMPILER_PROGRAM_NOT_CLEAN" };
  }
  const beforePaths = object(compiler.before?.by_path);
  const afterPaths = object(compiler.after?.by_path);
  for (const [path, beforeEntryRaw] of Object.entries(beforePaths)) {
    const beforeEntry = object(beforeEntryRaw);
    const afterEntry = object(afterPaths[path]);
    const beforeTypes = new Map(list(beforeEntry.types).map((item) => [text(item?.name, 240), item]));
    const afterTypes = new Map(list(afterEntry.types).map((item) => [text(item?.name, 240), item]));
    for (const [symbol, prior] of beforeTypes.entries()) {
      const proposed = afterTypes.get(symbol);
      obligations.push({ path, kind: "TS_COMPILER_EXPORTED_TYPE", symbol });
      if (!proposed) {
        violations.push({ path, kind: "TS_COMPILER_EXPORTED_TYPE_REMOVED", symbol });
        continue;
      }
      if (list(prior?.type_parameters).length !== list(proposed?.type_parameters).length) {
        violations.push({ path, kind: "TS_COMPILER_EXPORTED_TYPE_GENERIC_ARITY_CHANGED", symbol, before_type_parameter_count: list(prior?.type_parameters).length, proposed_type_parameter_count: list(proposed?.type_parameters).length });
      }
      compareCompilerProperties({ path, symbol, scope: "EXPORTED_TYPE", beforeProperties: prior?.properties, afterProperties: proposed?.properties, violations, obligations });
    }
    const beforeFunctions = new Map(list(beforeEntry.functions).map((item) => [text(item?.name, 240), item]));
    const afterFunctions = new Map(list(afterEntry.functions).map((item) => [text(item?.name, 240), item]));
    for (const [symbol, prior] of beforeFunctions.entries()) {
      const proposed = afterFunctions.get(symbol);
      if (!proposed) continue;
      const beforeSignature = list(prior?.signatures)[0];
      const afterSignature = list(proposed?.signatures)[0];
      if (!beforeSignature || !afterSignature) continue;
      if (list(beforeSignature.type_parameters).length !== list(afterSignature.type_parameters).length) {
        violations.push({ path, kind: "TS_COMPILER_FUNCTION_GENERIC_ARITY_CHANGED", symbol, before_type_parameter_count: list(beforeSignature.type_parameters).length, proposed_type_parameter_count: list(afterSignature.type_parameters).length });
      }
      const beforeParams = list(beforeSignature.parameters);
      const afterParams = list(afterSignature.parameters);
      for (let index = 0; index < Math.min(beforeParams.length, afterParams.length); index += 1) {
        compareCompilerProperties({ path, symbol, scope: "PARAMETER", beforeProperties: beforeParams[index]?.properties, afterProperties: afterParams[index]?.properties, violations, obligations });
      }
      compareCompilerProperties({ path, symbol, scope: "RETURN", beforeProperties: beforeSignature.return_properties, afterProperties: afterSignature.return_properties, violations, obligations });
    }
  }
  return { enforced: true, reason: null };
}

function proposedState(state, writes) {
  const paths = unique(writes.map((item) => item?.path));
  return {
    ...state,
    files_changed: unique([...list(state?.files_changed), ...paths]),
    source_changes: [
      ...list(state?.source_changes).filter((entry) => !paths.includes(text(entry?.path, 1200))),
      ...writes.map((item) => ({ path: text(item?.path, 1200), operation: "write", content: String(item?.content ?? "") })),
    ],
  };
}
function currentStateForPaths(state, writes) {
  const paths = unique(writes.map((item) => item?.path));
  const syntheticReads = paths.flatMap((path, index) => {
    const content = observedReadContent(state, path);
    return content ? [{
      kind: "operation", action: "read", status: "completed",
      operation_id: `contract_guard_current_${index + 1}`,
      result: { file_path: path, content },
    }] : [];
  });
  return {
    ...state,
    files_changed: unique([...list(state?.files_changed), ...paths]),
    source_changes: list(state?.source_changes).filter((entry) => !paths.includes(text(entry?.path, 1200))),
    evidence: [...list(state?.evidence), ...syntheticReads],
  };
}

export function assessCodeAIObservedContractCompatibility({ state = {}, writes = [] } = {}) {
  const normalizedWrites = list(writes).map((item) => ({ path: text(item?.path, 1200), content: String(item?.content ?? "") })).filter((item) => item.path);
  if (!normalizedWrites.length) return { contract: CODE_AI_OBSERVED_CONTRACT_GUARD, required: false, compatible: true, violations: [], coherent_contract_migrations: [] };
  const writesByPath = writeMap(normalizedWrites);
  const before = deriveCodeAICausalGraph(currentStateForPaths(state, normalizedWrites));
  const proposed = proposedState(state, normalizedWrites);
  const after = deriveCodeAICausalGraph(proposed);
  const violations = [];
  const obligations = [];
  const coherentMigrations = [];
  const migrationKeys = new Set();
  const compilerContracts = buildCodeAITypeScriptCompilerContracts({ state, writes: normalizedWrites });
  for (const write of normalizedWrites) {
    const beforeEntry = list(before.changed_path_consumers).find((entry) => entry?.path === write.path) || {};
    const afterEntry = list(after.changed_path_consumers).find((entry) => entry?.path === write.path) || {};
    const afterExports = new Set(list(afterEntry.observed_exports));
    const beforeAnalysis = analyzeCodeAISourceDependencies(write.path, observedReadContent(state, write.path) || "");
    const afterAnalysis = analyzeCodeAISourceDependencies(write.path, write.content);
    const beforeFunctions = new Map(list(beforeAnalysis.function_contracts).map((item) => [text(item?.name, 240), item]));
    const afterFunctions = new Map(list(afterAnalysis.function_contracts).map((item) => [text(item?.name, 240), item]));
    const beforeTypes = new Map(list(beforeAnalysis.type_contracts).map((item) => [text(item?.name, 240), item]));
    const afterTypes = new Map(list(afterAnalysis.type_contracts).map((item) => [text(item?.name, 240), item]));
    for (const [typeName, priorType] of beforeTypes.entries()) {
      if (priorType?.exported !== true) continue;
      const proposedType = afterTypes.get(typeName);
      if (!proposedType) {
        obligations.push({ path: write.path, kind: "TS_EXPORTED_TYPE", symbol: typeName });
        violations.push({ path: write.path, kind: "TS_EXPORTED_TYPE_REMOVED", symbol: typeName });
        continue;
      }
      compareTypeProperties({
        path: write.path, symbol: typeName, scope: "TS_EXPORTED_TYPE",
        beforeProperties: priorType.properties, afterProperties: proposedType.properties, obligations, violations,
      });
    }
    for (const [symbol, priorFunction] of beforeFunctions.entries()) {
      if (priorFunction?.exported !== true) continue;
      const proposedFunction = afterFunctions.get(symbol);
      if (!proposedFunction) continue;
      const beforeParamShapes = new Map(list(priorFunction.parameter_object_shapes).map((shape) => [Number(shape?.index), shape]));
      const afterParamShapes = new Map(list(proposedFunction.parameter_object_shapes).map((shape) => [Number(shape?.index), shape]));
      for (const [index, priorShape] of beforeParamShapes.entries()) {
        const proposedShape = afterParamShapes.get(index);
        if (!proposedShape) {
          for (const prop of list(priorShape?.properties)) {
            obligations.push({ path: write.path, kind: "TS_PARAMETER_PROPERTY", symbol, parameter_index: index, property: text(prop?.name, 240), optional: prop?.optional === true });
            violations.push({ path: write.path, kind: "TS_PARAMETER_PROPERTY_REMOVED", symbol, parameter_index: index, property: text(prop?.name, 240) });
          }
          continue;
        }
        compareTypeProperties({
          path: write.path, symbol, scope: "TS_PARAMETER",
          beforeProperties: priorShape.properties, afterProperties: proposedShape.properties, obligations, violations,
        });
      }
      const priorReturn = priorFunction.typed_return_shape || {};
      const proposedReturn = proposedFunction.typed_return_shape || {};
      if (list(priorReturn.properties).length) {
        compareTypeProperties({
          path: write.path, symbol, scope: "TS_RETURN",
          beforeProperties: priorReturn.properties, afterProperties: proposedReturn.properties, obligations, violations,
        });
      }
    }
    const callerSymbols = unique(list(beforeEntry.observed_symbol_calls).map((call) => call?.target_symbol));
    const symbolMigrations = new Map();
    for (const symbol of callerSymbols) {
      obligations.push({ path: write.path, kind: "OBSERVED_IMPORTED_SYMBOL", symbol });
      if (!afterExports.has(symbol)) {
        const migration = coherentSymbolMigration({ beforeEntry, after, providerPath: write.path, oldSymbol: symbol, afterExports, writesByPath });
        if (migration) {
          symbolMigrations.set(symbol, migration.to_symbol);
          const key = `${migration.kind}:${migration.path}:${migration.from_symbol}:${migration.to_symbol}`;
          if (!migrationKeys.has(key)) { migrationKeys.add(key); coherentMigrations.push(migration); }
        } else {
          violations.push({
            path: write.path,
            kind: "OBSERVED_IMPORTED_SYMBOL_REMOVED",
            symbol,
            observed_callers: list(beforeEntry.observed_symbol_calls).filter((call) => call?.target_symbol === symbol).map((call) => call?.caller),
          });
        }
      }
    }
    for (const call of list(beforeEntry.observed_symbol_calls)) {
      const symbol = text(call?.target_symbol, 240);
      const caller = text(call?.caller, 1200);
      const migratedSymbol = symbolMigrations.get(symbol) || symbol;
      const proposedFunction = afterFunctions.get(migratedSymbol);
      let effectiveArgs = Number(call?.observed_argument_count);
      if (writesByPath.has(caller)) {
        const matchingCalls = afterCallsFromCaller(after, caller, write.path)
          .filter((edge) => text(edge?.target_symbol, 240) === migratedSymbol);
        if (matchingCalls.length === 1 && Number.isInteger(Number(matchingCalls[0]?.observed_argument_count))) {
          effectiveArgs = Number(matchingCalls[0].observed_argument_count);
        }
      }
      if (proposedFunction && Number.isInteger(effectiveArgs)) {
        obligations.push({ path: write.path, kind: "OBSERVED_CALL_ARITY", symbol, observed_argument_count: Number(call?.observed_argument_count) });
        const incompatible = Number(proposedFunction.min_arity || 0) > effectiveArgs || (proposedFunction.max_arity !== null && Number.isInteger(Number(proposedFunction.max_arity)) && Number(proposedFunction.max_arity) < effectiveArgs);
        if (incompatible) {
          violations.push({ path: write.path, kind: "OBSERVED_CALL_ARITY_INCOMPATIBLE", symbol: migratedSymbol, observed_argument_count: effectiveArgs, proposed_min_arity: proposedFunction.min_arity, proposed_max_arity: proposedFunction.max_arity, observed_callers: [caller].filter(Boolean) });
        } else if (writesByPath.has(caller) && effectiveArgs !== Number(call?.observed_argument_count)) {
          const key = `COHERENT_CALL_ARITY_MIGRATION:${write.path}:${migratedSymbol}:${caller}`;
          if (!migrationKeys.has(key)) {
            migrationKeys.add(key);
            coherentMigrations.push({ kind: "COHERENT_CALL_ARITY_MIGRATION", path: write.path, symbol: migratedSymbol, caller, from_argument_count: Number(call?.observed_argument_count), to_argument_count: effectiveArgs });
          }
        }
      }
    }
    const resultFieldEdges = list(before.edges).filter((edge) => edge?.to === write.path && edge?.relation === "reads_imported_result_field");
    for (const edge of resultFieldEdges) {
      const oldSymbol = text(edge?.target_symbol, 240);
      const symbol = symbolMigrations.get(oldSymbol) || oldSymbol;
      const field = text(edge?.result_field, 240);
      const caller = text(edge?.from, 1200);
      const prior = beforeFunctions.get(oldSymbol);
      const proposedFunction = afterFunctions.get(symbol);
      if (!prior || !proposedFunction || !field || !list(prior.return_fields).includes(field)) continue;
      obligations.push({ path: write.path, kind: "OBSERVED_RETURN_FIELD", symbol: oldSymbol, field });
      if (!list(proposedFunction.return_fields).includes(field)) {
        let migrated = null;
        if (writesByPath.has(caller)) {
          const reads = afterResultReadsFromCaller(after, caller, write.path)
            .filter((candidate) => text(candidate?.target_symbol, 240) === symbol);
          const fields = unique(reads.map((candidate) => candidate?.result_field))
            .filter((candidate) => list(proposedFunction.return_fields).includes(candidate));
          if (fields.length === 1 && fields[0] !== field) migrated = fields[0];
        }
        if (migrated) {
          const key = `COHERENT_RETURN_FIELD_MIGRATION:${write.path}:${symbol}:${caller}:${field}:${migrated}`;
          if (!migrationKeys.has(key)) {
            migrationKeys.add(key);
            coherentMigrations.push({ kind: "COHERENT_RETURN_FIELD_MIGRATION", path: write.path, symbol, caller, from_field: field, to_field: migrated });
          }
        } else {
          violations.push({ path: write.path, kind: "OBSERVED_RETURN_FIELD_REMOVED", symbol, field, observed_callers: [caller].filter(Boolean) });
        }
      }
    }
    for (const priorSchema of list(beforeAnalysis.schema_references)) {
      const schemaKind = text(priorSchema?.kind, 80);
      const schemaName = text(priorSchema?.name, 500);
      if (!schemaKind || !schemaName) continue;
      const proposedSchema = matchingSchema(afterAnalysis, schemaKind, schemaName);
      if (!proposedSchema) continue;
      if (schemaKind === "table") {
        const proposedColumns = new Set(unique(list(proposedSchema?.selected_columns)));
        for (const column of unique(list(priorSchema?.selected_columns))) {
          obligations.push({ path: write.path, kind: "SUPABASE_SELECTED_COLUMN", table: schemaName, column });
          if (!proposedColumns.has(column)) violations.push({ path: write.path, kind: "SUPABASE_SELECTED_COLUMN_REMOVED", table: schemaName, column });
        }
        const proposedFilters = new Set(unique(list(proposedSchema?.filter_keys)));
        for (const key of unique(list(priorSchema?.filter_keys))) {
          obligations.push({ path: write.path, kind: "SUPABASE_FILTER_KEY", table: schemaName, key });
          if (!proposedFilters.has(key)) violations.push({ path: write.path, kind: "SUPABASE_FILTER_KEY_REMOVED", table: schemaName, key });
        }
        const proposedMutationFields = new Set(unique(list(proposedSchema?.mutation_fields)));
        for (const field of unique(list(priorSchema?.mutation_fields))) {
          obligations.push({ path: write.path, kind: "SUPABASE_MUTATION_FIELD", table: schemaName, field });
          if (!proposedMutationFields.has(field)) violations.push({ path: write.path, kind: "SUPABASE_MUTATION_FIELD_REMOVED", table: schemaName, field });
        }
      }
      if (schemaKind === "rpc") {
        const proposedArgs = new Set(unique(list(proposedSchema?.argument_keys)));
        for (const key of unique(list(priorSchema?.argument_keys))) {
          obligations.push({ path: write.path, kind: "SUPABASE_RPC_ARGUMENT_KEY", rpc: schemaName, key });
          if (!proposedArgs.has(key)) violations.push({ path: write.path, kind: "SUPABASE_RPC_ARGUMENT_KEY_REMOVED", rpc: schemaName, key });
        }
      }
    }
    for (const [symbol, prior] of beforeFunctions.entries()) {
      if (!prior?.exported) continue;
      const proposedFunction = afterFunctions.get(symbol);
      if (!proposedFunction) continue;
      for (const key of list(prior.context_keys)) {
        obligations.push({ path: write.path, kind: "BUSINESS_CONTEXT_INVARIANT", symbol, key });
        if (!list(proposedFunction.context_keys).includes(key)) violations.push({ path: write.path, kind: "BUSINESS_CONTEXT_INVARIANT_REMOVED", symbol, key });
      }
    }
    if (ROUTE_HANDLER.test(write.path)) {
      const beforeExports = new Set(list(beforeEntry.observed_exports));
      for (const method of HTTP_EXPORTS) {
        if (!beforeExports.has(method)) continue;
        obligations.push({ path: write.path, kind: "NEXT_ROUTE_HANDLER_METHOD", symbol: method });
        if (!afterExports.has(method)) {
          violations.push({ path: write.path, kind: "NEXT_ROUTE_HANDLER_METHOD_REMOVED", symbol: method });
          continue;
        }
        const priorMethod = beforeFunctions.get(method);
        const proposedMethod = afterFunctions.get(method);
        if (!priorMethod || !proposedMethod) continue;
        const proposedFields = new Set(unique(list(proposedMethod.response_fields)));
        for (const field of unique(list(priorMethod.response_fields))) {
          obligations.push({ path: write.path, kind: "NEXT_ROUTE_RESPONSE_FIELD", symbol: method, field });
          if (!proposedFields.has(field)) violations.push({ path: write.path, kind: "NEXT_ROUTE_RESPONSE_FIELD_REMOVED", symbol: method, field });
        }
      }
    }
  }
  const compilerCompatibility = applyCompilerContractCompatibility({ compiler: compilerContracts, violations, obligations });
  const observedCurrentSourceCount = normalizedWrites.filter((item) => observedReadContent(state, item.path)).length;
  const verifierPaths = coherentMigrations.length ? impactedVerifierPaths(after, normalizedWrites.map((item) => item.path)) : [];
  return {
    contract: CODE_AI_OBSERVED_CONTRACT_GUARD,
    required: obligations.length > 0,
    compatible: violations.length === 0,
    obligation_count: obligations.length,
    obligations: obligations.slice(0, 40),
    violations: violations.slice(0, 40),
    coherent_contract_migration_count: coherentMigrations.length,
    coherent_contract_migrations: coherentMigrations.slice(0, 40),
    requires_verification: coherentMigrations.length > 0,
    impacted_verifier_paths: verifierPaths,
    coherent_migration_requires_dependency_aware_verification: coherentMigrations.length > 0,
    ambiguous_or_partial_migration_rejected: true,
    typescript_compiler_contract: CODE_AI_TYPESCRIPT_COMPILER_CONTRACT,
    typescript_compiler_active: compilerContracts.active === true,
    typescript_compiler_before_clean: compilerContracts.before?.clean === true,
    typescript_compiler_after_clean: compilerContracts.after?.clean === true,
    typescript_compiler_enforced: compilerCompatibility.enforced === true,
    typescript_compiler_enforcement_reason: compilerCompatibility.reason || null,
    typescript_compiler_repository_wide_compile_performed: false,
    strict_contract_kinds_not_auto_migrated: [
      "BUSINESS_CONTEXT_INVARIANT",
      "SUPABASE_SELECTED_COLUMN",
      "SUPABASE_FILTER_KEY",
      "SUPABASE_MUTATION_FIELD",
      "SUPABASE_RPC_ARGUMENT_KEY",
      "NEXT_ROUTE_HANDLER_METHOD",
      "NEXT_ROUTE_RESPONSE_FIELD",
      "TS_EXPORTED_TYPE",
      "TS_PARAMETER_PROPERTY",
      "TS_RETURN_PROPERTY",
      "TS_COMPILER_EXPORTED_TYPE",
      "TS_COMPILER_PARAMETER_PROPERTY",
      "TS_COMPILER_RETURN_PROPERTY",
    ],
    observed_current_source_count: observedCurrentSourceCount,
    incomplete_evidence_is_not_compatibility_proof: true,
    model_call_performed: false,
    provider_call_performed: false,
    source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

export function assertCodeAIObservedContractCompatibility(input = {}) {
  const result = assessCodeAIObservedContractCompatibility(input);
  if (!result.compatible) {
    const error = new Error(`CODE_AI_OBSERVED_CONTRACT_VIOLATION:${result.violations.map((item) => `${item.path}#${item.symbol}`).join(",")}`);
    error.details = result;
    throw error;
  }
  return result;
}

export default Object.freeze({ contract: CODE_AI_OBSERVED_CONTRACT_GUARD, assess: assessCodeAIObservedContractCompatibility, assert: assertCodeAIObservedContractCompatibility });
