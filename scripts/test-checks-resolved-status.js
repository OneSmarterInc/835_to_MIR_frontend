import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const checksViewPath = path.join(here, "..", "src", "pages", "ChecksView.jsx");
const source = fs.readFileSync(checksViewPath, "utf8");

const requiredContracts = [
  ["resolved status field", "hold_resolution_status"],
  ["resolving MIR filename", "hold_resolved_mir_filename"],
  ["resolution timestamp", "hold_resolved_at"],
  ["resolved source 835 filename", "hold_resolved_source_835_filename"],
  ["resolved badge value", 'resolutionStatus === "RESOLVED"'],
  ["status badge rendering", "{claim.resolutionStatus}"],
];

for (const [label, token] of requiredContracts) {
  if (!source.includes(token)) {
    throw new Error(`ChecksView is missing the ${label} contract (${token}).`);
  }
}

console.log("ChecksView resolved-claim status contract is present.");
