import {
  authorizeTableCommand,
  executeTableCommand,
  validateTableCommand,
} from "../tableCommandRuntime";

export const manifest = {
  domain: "restaurant",
  capability: "posTableActions",
  action: "MergeTables",
};

export function validate(args) {
  return validateTableCommand("MERGE_TABLES", args);
}

export function authorize(args) {
  return authorizeTableCommand(args);
}

export function execute(args) {
  return executeTableCommand("MERGE_TABLES", args);
}
