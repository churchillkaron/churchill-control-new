import fs from "fs";
import path from "path";

const DOMAIN_FOLDERS = [
  "runtime",
  "documents",
  "objects",
  "aggregates",
  "capabilities",
  "workflows",
  "repositories",
  "events",
  "services",
  "reports",
  "ui",
  "integrations",
  "ai",
];

export function createDomainSkeleton(domainName) {
  const root = path.join(process.cwd(), "lib", domainName);

  fs.mkdirSync(root, { recursive: true });

  for (const folder of DOMAIN_FOLDERS) {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
  }

  const domainFile = path.join(root, `${toPascal(domainName)}Domain.js`);

  if (!fs.existsSync(domainFile)) {
    fs.writeFileSync(
      domainFile,
      `export const ${toPascal(domainName)}Domain = {
  id: "${domainName}",
  name: "${toTitle(domainName)}",
  status: "SCAFFOLDED",
};
`
    );
  }

  const runtimeFile = path.join(root, "runtime", `${toPascal(domainName)}Runtime.js`);

  if (!fs.existsSync(runtimeFile)) {
    fs.writeFileSync(
      runtimeFile,
      `export const ${toPascal(domainName)}Runtime = {
  domain: "${domainName}",
  capabilities: {},
  workflows: {},
  documents: {},
};
`
    );
  }

  const eventsFile = path.join(root, "events", `${toPascal(domainName)}Events.js`);

  if (!fs.existsSync(eventsFile)) {
    fs.writeFileSync(
      eventsFile,
      `export const ${toPascal(domainName)}Events = {};
`
    );
  }
}

function toPascal(value) {
  return String(value)
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toTitle(value) {
  return String(value)
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
