import React from "react";

const streams = [
  {
    label: "Billed in 835", amount: "billed_835_amount", count: "billed_835_claims",
    basis: "Claim charges · 835 received date", empty: "No 835 claims in this period",
  },
  {
    label: "Billed MIR", amount: "billed_mir_amount", count: "billed_mir_services",
    basis: "Generated service charges · conversion date", empty: "No MIR services in this period",
  },
  {
    label: "Amount in Recon", amount: "recon_amount", count: "recon_claims",
    basis: "Reported paid amount · Recon received date", empty: "No Recon claims in this period",
  },
];
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function ClientFinancialAmounts({ metrics, loading = false }) {
  return <section className="cu-money-strip" aria-label="Financial amounts for selected period" aria-busy={loading}>
    {streams.map(stream => {
      const amount = metrics?.[stream.amount];
      const count = metrics?.[stream.count];
      const available = !loading && Number.isInteger(count) && count >= 0 &&
        typeof amount === "string" && /^-?\d+\.\d{2}$/.test(amount);
      const empty = available && count === 0;
      return <div key={stream.amount}>
        <span>{stream.label}</span>
        {/* Keep the decimal string intact: Number() can lose financial cents. */}
        <strong>{available && !empty ? dollars.format(amount) : "—"}</strong>
        <small>{loading ? "Loading…" : !available ? "Amount unavailable" : empty ? stream.empty : stream.basis}</small>
      </div>;
    })}
    <small>USD · Each stream uses its own event date within the selected period.</small>
  </section>;
}
