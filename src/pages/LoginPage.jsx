import React, { useState } from "react";
import { safeFetchJson } from "../utils/api";

export default function LoginPage({ onLoginSuccess, isAdminRoute }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { res, data } = await safeFetchJson("/accounts/api/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, isAdminRoute }),
      });

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Sign in failed.");
      }

      onLoginSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const brandLabel = isAdminRoute ? (
    <div className="auth-brand">
      ONESMARTER <span>/ ADMIN</span>
    </div>
  ) : (
    <div className="auth-brand">
      ONESMARTER <span>/ PORTAL</span>
    </div>
  );

  const title = isAdminRoute ? "Admin Sign In" : "Sign In";
  const subtitle = isAdminRoute
    ? "Administrator access to client onboarding, compliance evidence, and integrations."
    : "MIR Relay - EDI 835 Conversion Operations";

  const emailLabel = isAdminRoute ? "Work email" : "Email Address";

  return (
    <div className="auth-wrapper">
      {brandLabel}
      <div className="auth-card">
        <h1>{title}</h1>
        <p className="sub">{subtitle}</p>

        {error && <div className="auth-error" style={{ color: "#ef4444", marginBottom: "16px", fontSize: "14px" }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>{emailLabel}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Continuing..." : "Continue"}
          </button>
        </form>

        <div className="auth-footer" style={{ textAlign: "center" }}>
          {isAdminRoute ? (
            <>
              Access is restricted to authorized OneSmarter administrative staff.
              <div style={{ marginTop: "12px" }}>
                <a href="/" style={{ color: "#475569", textDecoration: "none" }}>← Back to Client Portal</a>
              </div>
            </>
          ) : (
            <>
              Access is restricted to authorized OneSmarter client users.
              <div style={{ marginTop: "12px" }}>
                <a href="/administrator" style={{ color: "#475569", textDecoration: "none" }}>Administrator? Sign in here →</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

