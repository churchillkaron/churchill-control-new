import {
  authorizeTableCommand,
  executeTableCommand,
  validateTableCommand,
} from "../tableCommandRuntime";

export const manifest = {
  domain: "restaurant",
  capability: "posTableActions",
  action: "CloseTable",
};

export function validate(args) {
  return validateTableCommand("CLOSE_TABLE", args);
}

export function authorize(args) {
  return authorizeTableCommand(args);
}

export function execute(args) {
  return executeTableCommand("CLOSE_TABLE", args);
}
