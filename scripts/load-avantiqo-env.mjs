import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import nextEnv from "@next/env";

const { processEnv } = nextEnv;

function existingFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function gitPrimaryCheckout(cwd) {
  try {
    const commonDirValue = execFileSync(
      "git",
      ["rev-parse", "--git-common-dir"],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (!commonDirValue) return null;
    const commonDir = path.resolve(cwd, commonDirValue);
    const primary = path.dirname(commonDir);
    return path.resolve(primary) === path.resolve(cwd) ? null : primary;
  } catch {
    return null;
  }
}

function environmentFiles(root, label) {
  if (!root) return [];
  const isTest = process.env.NODE_ENV === "test";
  const mode = isTest
    ? "test"
    : process.env.NODE_ENV === "development"
      ? "development"
      : "production";
  const names = [
    `.env.${mode}.local`,
    ...(isTest ? [] : [".env.local"]),
    `.env.${mode}`,
    ".env",
  ];

  return names
    .map((name) => ({
      path: `${label}/${name}`,
      absolutePath: path.join(root, name),
    }))
    .filter((entry) => existingFile(entry.absolutePath))
    .map((entry) => ({
      path: entry.path,
      contents: fs.readFileSync(entry.absolutePath, "utf8"),
    }));
}

export function loadAvantiqoEnv({ cwd = process.cwd() } = {}) {
  const currentRoot = path.resolve(cwd);
  const primaryRoot = gitPrimaryCheckout(currentRoot);
  const loadedEnvFiles = [
    ...environmentFiles(currentRoot, "worktree"),
    ...environmentFiles(primaryRoot, "primary-checkout"),
  ];

  processEnv(
    loadedEnvFiles,
    currentRoot,
    {
      info() {},
      error(message, error) {
        console.error(message, error?.message || error || "");
      },
    },
    true,
  );

  return {
    current_root: currentRoot,
    primary_root: primaryRoot,
    loaded_file_count: loadedEnvFiles.length,
    primary_environment_loaded: Boolean(
      primaryRoot && loadedEnvFiles.some((file) =>
        file.path.startsWith("primary-checkout/"),
      ),
    ),
  };
}
