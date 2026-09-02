import assert from "node:assert/strict";
import fs from "node:fs";

const tableScreens = [
  "src/pages/ArchiveView.jsx",
  "src/pages/ChecksView.jsx",
  "src/pages/ConnectionsView.jsx",
  "src/pages/ContactsView.jsx",
  "src/pages/ConversionsView.jsx",
  "src/pages/ResultView.jsx",
  "src/onesmarter_admin/components/AccessView.jsx",
  "src/onesmarter_admin/components/AuditLogView.jsx",
  "src/onesmarter_admin/components/ClientsTable.jsx",
  "src/onesmarter_admin/components/DocumentsView.jsx",
  "src/onesmarter_admin/components/FilesView.jsx",
  "src/onesmarter_admin/components/SftpAutomationView.jsx",
];

for (const filename of tableScreens) {
  const source = fs.readFileSync(filename, "utf8");
  assert.match(source, /<section[^>]*className="[^"]*table-screen/, `${filename} must use the shared table-screen layout`);
}

const appSource = fs.readFileSync("src/onesmarter_admin/App.jsx", "utf8");
assert.match(appSource, /className="view on table-screen" id="v-trust"/, "Trust Center table must use the shared layout");

const css = fs.readFileSync("src/index.css", "utf8");
assert.match(css, /\.table-screen td:not\(\.num\).*overflow-wrap: anywhere/, "table values must remain contained");
assert.match(css, /\.table-screen-scroll[\s\S]*overflow-x: auto/, "table wrappers must provide horizontal overflow");

console.log("Shared table layout regression checks passed.");
