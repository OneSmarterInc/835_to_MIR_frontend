export function splitClaimNumber(value) {
  const claim = String(value || "").trim();
  const match = claim.match(/^(\d+)([A-Za-z].*)$/);
  return match
    ? { highmarkClaimNumber: match[1], internalClaimNumber: match[2] }
    : { highmarkClaimNumber: "", internalClaimNumber: claim };
}

export function claimParts(row) {
  const fallback = splitClaimNumber(row?.claim_id || row?.claim_control_number);
  return {
    highmarkClaimNumber: row?.highmark_claim_number || fallback.highmarkClaimNumber,
    internalClaimNumber: row?.internal_claim_number || fallback.internalClaimNumber,
  };
}
