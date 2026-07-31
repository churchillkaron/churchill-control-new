import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// Node --import modules execute before the command entrypoint. Load the same
// Next environment files here before importing runtimes that initialize the
// Supabase admin client at module evaluation time.
loadEnvConfig(process.cwd());

await import(
  "@/lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeDirectionResultCompletionRuntime"
);
