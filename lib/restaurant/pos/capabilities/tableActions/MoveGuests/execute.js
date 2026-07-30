import {
  authorizeTableCommand,
  executeTableCommand,
  validateTableCommand,
} from "../tableCommandRuntime";

export const manifest = {
  domain: "restaurant",
  capability: "posTableActions",
  action: "MoveGuests",
};

export function validate(args) {
  return validateTableCommand("MOVE_GUESTS", args);
}

export function authorize(args) {
  return authorizeTableCommand(args);
}

export function execute(args) {
  return executeTableCommand("MOVE_GUESTS", args);
}
