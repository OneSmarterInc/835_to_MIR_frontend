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
    : "MIR Relay · EDI 835 Conversion Operations";

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        {brandLabel}
        <h2>{title}</h2>
        <p className="auth-sub">{subtitle}</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Work Email</label>
            <input
              type="email"
              required
              placeholder="user@onesmarter.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Signing in..." : title}
          </button>
        </form>

        <div className="auth-foot">
          {isAdminRoute ? (
            <a href="/" style={{ color: "inherit" }}>← Back to Client Portal</a>
          ) : (
            <a href="/administrator" style={{ color: "inherit" }}>Administrator? Sign in here →</a>
          )}
        </div>
      </div>
    </div>
  );
}
