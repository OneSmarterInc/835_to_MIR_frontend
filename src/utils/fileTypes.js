const POLICIES = {
  "835": [".835", ".x12", ".edi", ".txt", ".dat", ".35", ".ansi", ".rem"],
  "837": [".837", ".x12", ".edi", ".txt", ".dat"],
  RECON: [".csv", ".tsv", ".txt", ".dat", ".p7a", ".recon", ".out", ".mir"],
};

export const fileAccept = (kind) => (POLICIES[kind] || []).join(",");

export function fileTypeError(kind) {
  return `Wrong file format for ${kind}. Allowed extensions: ${(POLICIES[kind] || []).join(", ")}.`;
}

export function validateFileExtensions(files, kind) {
  const allowed = POLICIES[kind] || [];
  const invalid = Array.from(files || []).find((file) => {
    const name = String(file?.name || "").toLowerCase();
    return !allowed.some((extension) => name.endsWith(extension));
  });
  return invalid ? fileTypeError(kind) : null;
}
