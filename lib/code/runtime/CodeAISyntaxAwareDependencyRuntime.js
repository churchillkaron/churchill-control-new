import { parse } from "@babel/parser";

export const CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT =
  "AVANTIQO_CODE_AI_SYNTAX_AWARE_DEPENDENCY_V1";

const MAX_AST_NODES = 12000;
const MAX_IMPORTS = 120;
const MAX_CALLS = 120;
const MAX_SCHEMA_REFS = 120;
const MAX_FUNCTION_CONTRACTS = 120;
const MAX_RESULT_FIELD_READS = 120;
const MAX_STATIC_CONTRACT_KEYS = 80;
const MAX_TYPE_CONTRACTS = 120;

function text(value, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parserPlugins(filePath) {
  const lower = text(filePath, 1200).toLowerCase();
  const plugins = ["jsx", "importAttributes", "topLevelAwait", "classProperties", "classPrivateProperties", "classPrivateMethods"];
  if (/\.(?:ts|tsx|mts|cts)$/.test(lower)) plugins.push("typescript");
  return plugins;
}

function literalString(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "StringLiteral" || node.type === "Literal") return text(node.value, 1200) || null;
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) {
    return text(node.quasis?.[0]?.value?.cooked, 1200) || null;
  }
  return null;
}

function memberName(node) {
  if (!node || node.type !== "MemberExpression") return null;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  return literalString(node.property);
}

function staticObjectKeys(node) {
  let value = node;
  if (value?.type === "TSAsExpression" || value?.type === "TSSatisfiesExpression") value = value.expression;
  if (value?.type !== "ObjectExpression") return [];
  const keys = [];
  for (const prop of value.properties || []) {
    if (prop?.type === "SpreadElement") return [];
    if (prop?.computed) return [];
    if (prop?.type !== "ObjectProperty" && prop?.type !== "ObjectMethod") continue;
    const key = prop.key?.name || literalString(prop.key);
    if (key) keys.push(key);
  }
  return unique(keys).slice(0, MAX_STATIC_CONTRACT_KEYS);
}

function staticMutationKeys(node) {
  if (node?.type === "ArrayExpression") {
    const rows = (node.elements || []).map(staticObjectKeys);
    if (!rows.length || rows.some((row) => !row.length)) return [];
    return unique(rows.flat()).slice(0, MAX_STATIC_CONTRACT_KEYS);
  }
  return staticObjectKeys(node);
}

function walkAst(root, visit) {
  const stack = [root];
  let visited = 0;
  while (stack.length && visited < MAX_AST_NODES) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    visited += 1;
    visit(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          if (value[index] && typeof value[index] === "object") stack.push(value[index]);
        }
      } else if (value && typeof value === "object" && typeof value.type === "string") {
        stack.push(value);
      }
    }
  }
  return { visited, bounded: stack.length > 0 };
}

function addImportBinding(bindings, imports, source, kind, imported, local) {
  if (!source || imports.length >= MAX_IMPORTS) return;
  const binding = { source, kind, imported, local };
  imports.push(binding);
  if (local) bindings.set(local, binding);
}

function analyzeAst(filePath, content) {
  const source = String(content ?? "");
  let ast;
  try {
    ast = parse(source, {
      sourceType: "unambiguous",
      errorRecovery: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      plugins: parserPlugins(filePath),
    });
  } catch (error) {
    return {
      parsed: false,
      parse_error: text(error?.message || error, 500),
      imports: [], exports: [], calls: [], schema_references: [], function_contracts: [], result_field_reads: [], type_contracts: [],
      ast_nodes_visited: 0, ast_walk_bounded: false,
    };
  }

  const bindings = new Map();
  const imports = [];
  const exports = [];
  const calls = [];
  const schemaReferences = [];
  const functionContracts = [];
  const resultFieldReads = [];
  const typeContracts = [];
  const seenCalls = new Set();
  const seenSchema = new Set();

  const importedCallBindings = new Map();
  const findFromTable = (node) => {
    let current = node;
    let depth = 0;
    while (current && depth < 8) {
      depth += 1;
      if (current.type === "CallExpression" && current.callee?.type === "MemberExpression") {
        const member = memberName(current.callee);
        if (member === "from") return literalString(current.arguments?.[0]);
        current = current.callee.object;
        continue;
      }
      if (current.type === "MemberExpression") { current = current.object; continue; }
      break;
    }
    return null;
  };
  const functionContractByName = new Map();
  const parameterMemberKeys = new Map();
  const importedBindingForCall = (call) => {
    if (!call || (call.type !== "CallExpression" && call.type !== "NewExpression")) return null;
    const callee = call.callee;
    if (callee?.type === "Identifier") return bindings.get(callee.name) || null;
    if (callee?.type === "MemberExpression" && callee.object?.type === "Identifier") {
      const binding = bindings.get(callee.object.name);
      const member = memberName(callee);
      if (binding?.kind === "namespace" && member) return { ...binding, imported: member, local: `${callee.object.name}.${member}` };
    }
    return null;
  };
  const functionName = (node, parentExport = false) => {
    if (!node) return null;
    if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id?.name) return node.id.name;
    if (parentExport && node.type === "FunctionDeclaration" && node.id?.name) return node.id.name;
    return null;
  };
  const staticReturnFields = (functionNode) => {
    const fields = [];
    if (!functionNode?.body) return fields;
    walkAst(functionNode.body, (child) => {
      if (child.type !== "ReturnStatement") return;
      let value = child.argument;
      if (value?.type === "AwaitExpression") value = value.argument;
      fields.push(...staticObjectKeys(value));
    });
    return unique(fields).slice(0, MAX_STATIC_CONTRACT_KEYS);
  };
  const staticResponseFields = (functionNode) => {
    const fields = [];
    if (!functionNode?.body) return fields;
    walkAst(functionNode.body, (child) => {
      if (child.type !== "CallExpression" || child.callee?.type !== "MemberExpression") return;
      const member = memberName(child.callee);
      const owner = child.callee.object?.type === "Identifier" ? child.callee.object.name : null;
      if (member !== "json" || !["Response", "NextResponse"].includes(owner)) return;
      fields.push(...staticObjectKeys(child.arguments?.[0]));
    });
    return unique(fields).slice(0, MAX_STATIC_CONTRACT_KEYS);
  };
  const tsTypeProperties = (node) => {
    let value = node;
    if (value?.type === "TSTypeAnnotation") value = value.typeAnnotation;
    if (value?.type === "TSTypeLiteral" || value?.type === "TSInterfaceBody") {
      const properties = [];
      for (const member of value.members || value.body || []) {
        if (member?.type !== "TSPropertySignature" || member.computed) continue;
        const key = member.key?.name || literalString(member.key);
        if (!key) continue;
        properties.push({ name: key, optional: member.optional === true, readonly: member.readonly === true });
      }
      return properties.slice(0, MAX_STATIC_CONTRACT_KEYS);
    }
    return [];
  };
  const referencedTypeName = (node) => {
    let value = node;
    if (value?.type === "TSTypeAnnotation") value = value.typeAnnotation;
    return value?.type === "TSTypeReference" && value.typeName?.type === "Identifier"
      ? text(value.typeName.name, 240)
      : null;
  };
  const registerTypeContract = ({ name, exported, properties }) => {
    const normalized = text(name, 240);
    if (!normalized || !properties?.length || typeContracts.length >= MAX_TYPE_CONTRACTS) return;
    const existing = typeContracts.findIndex((item) => item.name === normalized);
    const entry = {
      name: normalized,
      exported: exported === true || (existing >= 0 && typeContracts[existing]?.exported === true),
      properties: properties.slice(0, MAX_STATIC_CONTRACT_KEYS),
    };
    if (existing >= 0) typeContracts[existing] = entry;
    else typeContracts.push(entry);
  };
  const parameterObjectShapes = (params = []) => params.map((param, index) => {
    let value = param?.type === "TSParameterProperty" ? param.parameter : param;
    if (value?.type === "AssignmentPattern") value = value.left;
    const typeAnnotation = value?.typeAnnotation || null;
    const properties = tsTypeProperties(typeAnnotation);
    const typeName = referencedTypeName(typeAnnotation);
    if (!properties.length && !typeName) return null;
    return { index, optional: value?.optional === true || param?.type === "AssignmentPattern", type_name: typeName, properties };
  }).filter(Boolean);
  const returnTypeShape = (node) => {
    const typeAnnotation = node?.returnType || null;
    return { type_name: referencedTypeName(typeAnnotation), properties: tsTypeProperties(typeAnnotation) };
  };

  const parameterContract = (params = []) => {
    let minArity = 0;
    let maxArity = 0;
    let hasRest = false;
    const directContextKeys = new Set();
    for (const param of params) {
      if (!param) continue;
      let normalized = param;
      if (normalized.type === "TSParameterProperty") normalized = normalized.parameter;
      if (normalized?.type === "RestElement") { hasRest = true; continue; }
      maxArity += 1;
      const optional = normalized?.optional === true || normalized?.type === "AssignmentPattern";
      if (!optional) minArity += 1;
      const candidate = normalized?.type === "AssignmentPattern" ? normalized.left : normalized;
      if (candidate?.type === "ObjectPattern") {
        for (const prop of candidate.properties || []) {
          const key = prop?.key?.name || literalString(prop?.key);
          if (key && ["organization_id", "organizationId", "entity_id", "entityId", "period_id", "periodId"].includes(key)) directContextKeys.add(key);
        }
      }
    }
    return { min_arity: minArity, max_arity: hasRest ? null : maxArity, has_rest: hasRest, context_keys: [...directContextKeys] };
  };

  const walked = walkAst(ast, (node) => {
    if (node.type === "ImportDeclaration") {
      const specifier = literalString(node.source);
      for (const item of node.specifiers || []) {
        if (item.type === "ImportDefaultSpecifier") addImportBinding(bindings, imports, specifier, "default", "default", item.local?.name);
        else if (item.type === "ImportNamespaceSpecifier") addImportBinding(bindings, imports, specifier, "namespace", "*", item.local?.name);
        else if (item.type === "ImportSpecifier") addImportBinding(bindings, imports, specifier, "named", item.imported?.name || literalString(item.imported), item.local?.name);
      }
      if (!(node.specifiers || []).length && specifier && imports.length < MAX_IMPORTS) imports.push({ source: specifier, kind: "side_effect", imported: null, local: null });
    }
    if ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) {
      const specifier = literalString(node.source);
      if (specifier && imports.length < MAX_IMPORTS) imports.push({ source: specifier, kind: "reexport", imported: "*", local: null });
    }
    if (node.type === "ExportDefaultDeclaration") exports.push("default");
    if (node.type === "TSInterfaceDeclaration") {
      registerTypeContract({ name: node.id?.name, exported: false, properties: tsTypeProperties(node.body) });
    }
    if (node.type === "TSTypeAliasDeclaration") {
      registerTypeContract({ name: node.id?.name, exported: false, properties: tsTypeProperties(node.typeAnnotation) });
    }
    if (node.type === "ExportNamedDeclaration") {
      const decl = node.declaration;
      if (decl?.id?.name) exports.push(decl.id.name);
      if (decl?.type === "TSInterfaceDeclaration") registerTypeContract({ name: decl.id?.name, exported: true, properties: tsTypeProperties(decl.body) });
      if (decl?.type === "TSTypeAliasDeclaration") registerTypeContract({ name: decl.id?.name, exported: true, properties: tsTypeProperties(decl.typeAnnotation) });
      if (decl?.type === "FunctionDeclaration" && decl.id?.name && functionContracts.length < MAX_FUNCTION_CONTRACTS) {
        const shape = parameterContract(decl.params || []);
        const entry = { name: decl.id.name, exported: true, ...shape, return_fields: staticReturnFields(decl), response_fields: staticResponseFields(decl), parameter_object_shapes: parameterObjectShapes(decl.params || []), typed_return_shape: returnTypeShape(decl) };
        functionContracts.push(entry);
        functionContractByName.set(decl.id.name, entry);
        const namedParams = (decl.params || []).map((param) => param?.type === "Identifier" ? param.name : null).filter(Boolean);
        for (const name of namedParams) parameterMemberKeys.set(name, { function_name: decl.id.name, keys: new Set() });
      }
      if (decl?.type === "VariableDeclaration") {
        for (const item of decl.declarations || []) if (item.id?.type === "Identifier") exports.push(item.id.name);
      }
      for (const item of node.specifiers || []) exports.push(item.exported?.name || literalString(item.exported));
    }

    if (node.type === "FunctionDeclaration" && node.id?.name && !functionContractByName.has(node.id.name) && functionContracts.length < MAX_FUNCTION_CONTRACTS) {
      const shape = parameterContract(node.params || []);
      const entry = { name: node.id.name, exported: false, ...shape, return_fields: staticReturnFields(node), response_fields: staticResponseFields(node), parameter_object_shapes: parameterObjectShapes(node.params || []), typed_return_shape: returnTypeShape(node) };
      functionContracts.push(entry);
      functionContractByName.set(node.id.name, entry);
      for (const param of node.params || []) if (param?.type === "Identifier") parameterMemberKeys.set(param.name, { function_name: node.id.name, keys: new Set() });
    }
    if (node.type === "MemberExpression" && node.object?.type === "Identifier") {
      const tracked = parameterMemberKeys.get(node.object.name);
      const key = memberName(node);
      if (tracked && key && ["organization_id", "organizationId", "entity_id", "entityId", "period_id", "periodId"].includes(key)) tracked.keys.add(key);
      const callResult = importedCallBindings.get(node.object.name);
      if (callResult && key && resultFieldReads.length < MAX_RESULT_FIELD_READS) {
        resultFieldReads.push({ ...callResult, field: key });
      }
    }
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
      const call = node.init?.type === "AwaitExpression" ? node.init.argument : node.init;
      const binding = importedBindingForCall(call);
      if (binding) importedCallBindings.set(node.id.name, { source: binding.source, imported: binding.imported, local: binding.local || node.id.name });
    }

    if (node.type !== "CallExpression" && node.type !== "NewExpression") return;
    const callee = node.callee;
    if (callee?.type === "Identifier") {
      const binding = bindings.get(callee.name);
      if (binding && calls.length < MAX_CALLS) {
        const key = `${binding.source}:${binding.imported}:${callee.name}`;
        if (!seenCalls.has(key)) {
          seenCalls.add(key);
          calls.push({ source: binding.source, import_kind: binding.kind, imported: binding.imported, local: callee.name, member: null, argument_count: (node.arguments || []).length });
        }
      }
      if (callee.name === "require") {
        const specifier = literalString(node.arguments?.[0]);
        if (specifier && imports.length < MAX_IMPORTS) imports.push({ source: specifier, kind: "require", imported: "*", local: null });
      }
    } else if (callee?.type === "MemberExpression") {
      const member = memberName(callee);
      if (callee.object?.type === "Identifier") {
        const binding = bindings.get(callee.object.name);
        if (binding?.kind === "namespace" && member && calls.length < MAX_CALLS) {
          const key = `${binding.source}:${member}:${callee.object.name}`;
          if (!seenCalls.has(key)) {
            seenCalls.add(key);
            calls.push({ source: binding.source, import_kind: "namespace", imported: member, local: `${callee.object.name}.${member}`, member, argument_count: (node.arguments || []).length });
          }
        }
      }
      if (["select", "eq", "insert", "update", "upsert"].includes(member) && schemaReferences.length < MAX_SCHEMA_REFS) {
        const table = findFromTable(callee.object);
        if (table) {
          let existing = schemaReferences.find((item) => item.kind === "table" && item.name === table && item.relation === "references_database_table");
          if (!existing) {
            existing = { kind: "table", name: table, relation: "references_database_table" };
            schemaReferences.push(existing);
          }
          if (member === "select") {
            const selected = literalString(node.arguments?.[0]);
            const columns = selected && selected !== "*"
              ? unique(selected.split(",").map((item) => item.trim().split(/[(!:]/)[0].trim()).filter(Boolean)).slice(0, MAX_STATIC_CONTRACT_KEYS)
              : [];
            if (columns.length) existing.selected_columns = unique([...(existing.selected_columns || []), ...columns]).slice(0, MAX_STATIC_CONTRACT_KEYS);
          }
          if (member === "eq") {
            const key = literalString(node.arguments?.[0]);
            if (key) existing.filter_keys = unique([...(existing.filter_keys || []), key]).slice(0, MAX_STATIC_CONTRACT_KEYS);
          }
          if (["insert", "update", "upsert"].includes(member)) {
            const keys = staticMutationKeys(node.arguments?.[0]);
            if (keys.length) existing.mutation_fields = unique([...(existing.mutation_fields || []), ...keys]).slice(0, MAX_STATIC_CONTRACT_KEYS);
          }
        }
      }
      if ((member === "from" || member === "rpc") && schemaReferences.length < MAX_SCHEMA_REFS) {
        const value = literalString(node.arguments?.[0]);
        const kind = member === "from" ? "table" : "rpc";
        const key = `${kind}:${value}`;
        if (value) {
          let existing = schemaReferences.find((item) => item.kind === kind && item.name === value);
          if (!existing && !seenSchema.has(key)) {
            seenSchema.add(key);
            existing = { kind, name: value, relation: member === "from" ? "references_database_table" : "calls_database_rpc" };
            schemaReferences.push(existing);
          }
          if (member === "rpc" && existing) {
            const argumentKeys = staticObjectKeys(node.arguments?.[1]);
            if (argumentKeys.length) existing.argument_keys = unique([...(existing.argument_keys || []), ...argumentKeys]).slice(0, MAX_STATIC_CONTRACT_KEYS);
          }
        }
      }
    } else if (callee?.type === "Import") {
      const specifier = literalString(node.arguments?.[0]);
      if (specifier && imports.length < MAX_IMPORTS) imports.push({ source: specifier, kind: "dynamic", imported: "*", local: null });
    }
  });

  const typeContractMap = new Map(typeContracts.map((item) => [item.name, item]));
  for (const fn of functionContracts) {
    fn.parameter_object_shapes = (fn.parameter_object_shapes || []).map((shape) => {
      if (shape.properties?.length || !shape.type_name) return shape;
      const contract = typeContractMap.get(shape.type_name);
      return contract ? { ...shape, properties: contract.properties, resolved_local_type: true } : shape;
    });
    if (!fn.typed_return_shape?.properties?.length && fn.typed_return_shape?.type_name) {
      const contract = typeContractMap.get(fn.typed_return_shape.type_name);
      if (contract) fn.typed_return_shape = { ...fn.typed_return_shape, properties: contract.properties, resolved_local_type: true };
    }
  }

  for (const tracked of parameterMemberKeys.values()) {
    const entry = functionContractByName.get(tracked.function_name);
    if (entry) entry.context_keys = unique([...(entry.context_keys || []), ...tracked.keys]);
  }
  return {
    parsed: true,
    parse_error: null,
    imports: imports.slice(0, MAX_IMPORTS),
    exports: unique(exports).slice(0, 80),
    calls: calls.slice(0, MAX_CALLS),
    schema_references: schemaReferences.slice(0, MAX_SCHEMA_REFS),
    function_contracts: functionContracts.slice(0, MAX_FUNCTION_CONTRACTS),
    result_field_reads: resultFieldReads.slice(0, MAX_RESULT_FIELD_READS),
    type_contracts: typeContracts.slice(0, MAX_TYPE_CONTRACTS),
    ast_nodes_visited: walked.visited,
    ast_walk_bounded: walked.bounded,
  };
}

function analyzeSql(content) {
  const source = String(content ?? "");
  const relationships = [];
  const seen = new Set();
  const add = (relation, kind, name) => {
    const normalized = text(name, 500).replace(/^['"`]|['"`]$/g, "");
    const key = `${relation}:${kind}:${normalized}`;
    if (!normalized || seen.has(key) || relationships.length >= MAX_SCHEMA_REFS) return;
    seen.add(key);
    relationships.push({ relation, kind, name: normalized });
  };
  const patterns = [
    ["defines_table", "table", /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][\w.]*)/gi],
    ["alters_table", "table", /\balter\s+table\s+(?:if\s+exists\s+)?([a-zA-Z_][\w.]*)/gi],
    ["references_table", "table", /\breferences\s+([a-zA-Z_][\w.]*)/gi],
    ["defines_function", "function", /\bcreate\s+(?:or\s+replace\s+)?function\s+([a-zA-Z_][\w.]*)/gi],
    ["defines_view", "view", /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([a-zA-Z_][\w.]*)/gi],
  ];
  for (const [relation, kind, pattern] of patterns) {
    for (const match of source.matchAll(pattern)) add(relation, kind, match[1]);
  }
  return relationships;
}

export function analyzeCodeAISourceDependencies(filePath, content) {
  const path = text(filePath, 1200);
  if (/\.sql$/i.test(path)) {
    return {
      contract: CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT,
      parser: "STRUCTURED_SQL_RELATIONSHIP_SCANNER",
      syntax_aware: false,
      parsed: true,
      imports: [], exports: [], calls: [], function_contracts: [], result_field_reads: [], type_contracts: [],
      schema_references: analyzeSql(content),
      ast_nodes_visited: 0, ast_walk_bounded: false,
    };
  }
  if (!/\.(?:[cm]?[jt]sx?)$/i.test(path)) {
    return {
      contract: CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT,
      parser: "UNSUPPORTED",
      syntax_aware: false,
      parsed: false,
      parse_error: "UNSUPPORTED_SOURCE_TYPE",
      imports: [], exports: [], calls: [], schema_references: [], function_contracts: [], result_field_reads: [], type_contracts: [],
      ast_nodes_visited: 0, ast_walk_bounded: false,
    };
  }
  const result = analyzeAst(path, content);
  return {
    contract: CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT,
    parser: "BABEL_AST",
    syntax_aware: true,
    ...result,
  };
}

export const CodeAISyntaxAwareDependencyRuntime = Object.freeze({
  contract: CODE_AI_SYNTAX_AWARE_DEPENDENCY_CONTRACT,
  analyze: analyzeCodeAISourceDependencies,
  bounded_ast_nodes: MAX_AST_NODES,
  bounded_imports: MAX_IMPORTS,
  bounded_calls: MAX_CALLS,
  bounded_schema_references: MAX_SCHEMA_REFS,
  bounded_type_contracts: MAX_TYPE_CONTRACTS,
  repository_complete_graph_claimed: false,
  authorization_effect: "NONE",
});

export default CodeAISyntaxAwareDependencyRuntime;
