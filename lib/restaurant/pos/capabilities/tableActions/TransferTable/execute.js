import {
  authorizeTableCommand,
  executeTableCommand,
  validateTableCommand,
} from "../tableCommandRuntime";

export const manifest = {
  domain: "restaurant",
  capability: "posTableActions",
  action: "TransferTable",
};

export function validate(args) {
  return validateTableCommand("TRANSFER_TABLE", args);
}

export function authorize(args) {
  return authorizeTableCommand(args);
}

export function execute(args) {
  return executeTableCommand("TRANSFER_TABLE", args);
}
