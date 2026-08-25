import React, { useState } from "react";
import { safeFetchJson } from "../utils/api";

export default function TotpVerifyPage({
  onVerifySuccess,
  onSetupRequired,
  onLogout,
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { res, data } = await safeFetchJson(
        "/accounts/api/totp/verify/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        }
      );

      // User has not configured TOTP yet.
      // Return them to the QR-code setup screen.
      if (data.next === "totp_setup") {
        onSetupRequired?.();
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Invalid authenticator code.");
      }

      onVerifySuccess?.();
    } catch (err) {
      setError(err.message || "Unable to verify authenticator code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-brand">
        ONESMARTER <span>/ SECURITY</span>
      </div>

      <div className="auth-card">
        <h1>Two-Factor Verification</h1>

        <p className="sub">
          Enter the 6-digit code from your authenticator app.
        </p>

        {error && (
          <div
            className="error-msg"
            style={{ marginBottom: "20px" }}
          >
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="totp-code">
              Authenticator Code
            </label>

            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 6)
                )
              }
              placeholder="123456"
              autoComplete="one-time-code"
              required
              maxLength={6}
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || code.length !== 6}
          >
            {loading
              ? "Verifying..."
              : "Verify Authentication"}
          </button>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              disabled={loading}
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                marginTop: "16px",
                color: "var(--ink-2)",
                textDecoration: "underline",
                fontSize: "13px",
                border: "none",
                background: "none",
                cursor: "pointer",
              }}
            >
              Cancel & Log Out
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
