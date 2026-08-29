import React, { useState } from "react";

export default function AccessDeniedScreen({ client, message, onExit }) {
  const [exiting, setExiting] = useState(false);

  const handleExit = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      await onExit();
    } finally {
      setExiting(false);
    }
  };

  return (
    <main className="access-denied-screen" role="alert" aria-live="assertive">
      <section className="access-denied-card">
        <div className="access-denied-icon" aria-hidden="true">!</div>
        <h1>Access Denied</h1>
        <p>{message || "Access denied. Contact your administrator."}</p>
        {client && <p className="access-denied-client">Organization: {client}</p>}
        <button type="button" className="access-denied-exit" onClick={handleExit} disabled={exiting}>
          {exiting ? "Exiting..." : "Exit to Login"}
        </button>
      </section>
    </main>
  );
}
