import {
  createServerSupabase,
} from "./server";

export function getServiceSupabase() {
  return createServerSupabase();
}
