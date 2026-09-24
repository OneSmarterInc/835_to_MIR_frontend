export function splitClaimNumber(value) {
  const claim = String(value || "").trim();
  const match = claim.match(/^(\d+)[^A-Za-z0-9]*([A-Za-z].*)$/);
  if (match) return { highmarkClaimNumber: match[1], internalClaimNumber: match[2] };
  if (/^\d+$/.test(claim)) return { highmarkClaimNumber: claim, internalClaimNumber: "" };
  return { highmarkClaimNumber: "", internalClaimNumber: claim };
}

export function claimParts(row) {
  const fallback = splitClaimNumber(row?.claim_id || row?.claim_control_number);
  return {
    highmarkClaimNumber: row?.highmark_claim_number || fallback.highmarkClaimNumber,
    internalClaimNumber: row?.internal_claim_number || fallback.internalClaimNumber,
  };
}
