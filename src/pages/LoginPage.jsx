import React, { useState } from "react";
import { safeFetchJson } from "../utils/api";
import { startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage({ onLoginSuccess, onAccessDenied, isAdminRoute }) {
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

      if (data?.offboarded || data?.code === "CLIENT_OFFBOARDED") {
        onAccessDenied?.(data);
        return;
      }

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

  const handleWebAuthnLogin = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email to sign in with a Security Key.');
      return;
    }
    
    setLoading(true);
    try {
      setError('');
      const { res: optionsRes, data: options } = await safeFetchJson('/accounts/api/webauthn/login/options/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      if (options?.offboarded || options?.code === "CLIENT_OFFBOARDED") {
        onAccessDenied?.(options);
        return;
      }
      
      if (!optionsRes.ok) throw new Error(options.error || 'Failed to get options');
      
      let assertion;
      try {
        assertion = await startAuthentication({ optionsJSON: options });
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          setError('');
        } else {
          setError('Security Key login was cancelled or failed.');
        }
        return;
      }
      
      const { res: verificationRes, data: verificationData } = await safeFetchJson('/accounts/api/webauthn/login/verify/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, ...assertion })
      });
      
      if (verificationData?.offboarded || verificationData?.code === "CLIENT_OFFBOARDED") {
        onAccessDenied?.(verificationData);
        return;
      }
      
      if (!verificationRes.ok) throw new Error(verificationData.error || 'Security Key login failed');
      
      onLoginSuccess(verificationData);
      
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('');
      } else {
        setError(err.message || 'Security Key login failed');
      }
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

        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", margin: "24px 0" }}>
          <div style={{ position: "absolute", width: "100%", borderTop: "1px solid #e2e8f0" }}></div>
          <span style={{ background: "#fff", padding: "0 8px", fontSize: "12px", color: "#94a3b8", position: "relative" }}>OR</span>
        </div>

        <button
          type="button"
          onClick={handleWebAuthnLogin}
          disabled={loading}
          style={{ width: "100%", backgroundColor: "#fff", border: "1px solid #e2e8f0", color: "#334155", fontWeight: "500", fontSize: "14px", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
        >
          <svg style={{ width: "16px", height: "16px", color: "#64748b" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Continue with Security Key
        </button>

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
