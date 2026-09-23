import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getDemoRevealValue } from "../utils/demoEncoder";
import { isDemoModeEnabled } from "../utils/demoSubstitution";

function scanMaskedValues() {
  if (typeof document === "undefined") return [];

  const map = [];
  const occurrenceByToken = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;

  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest(".demo-reveal-layer")) continue;

    const text = node.nodeValue || "";
    const tokenPattern = /\S+/g;
    let match;

    while ((match = tokenPattern.exec(text))) {
      const token = match[0];
      const encodedValue = getDemoRevealValue(token);
      if (!encodedValue || encodedValue === token) continue;

      const occurrence = occurrenceByToken.get(token) || 0;
      occurrenceByToken.set(token, occurrence + 1);

      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + token.length);

      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;

      map.push({
        id: token + "::" + occurrence,
        token,
        encodedValue,
        rect,
      });
    }
  }

  return map;
}

export default function DemoRevealLayer() {
  const [targets, setTargets] = useState([]);
  const [revealed, setRevealed] = useState(() => new Set());
  const scanFrame = useRef(null);

  const refreshTargets = useCallback(() => {
    if (!isDemoModeEnabled()) {
      setTargets([]);
      setRevealed(new Set());
      return;
    }

    setTargets(scanMaskedValues());
  }, []);

  useEffect(() => {
    if (!isDemoModeEnabled()) return undefined;

    const scheduleScan = () => {
      if (scanFrame.current) window.cancelAnimationFrame(scanFrame.current);
      scanFrame.current = window.requestAnimationFrame(() => {
        scanFrame.current = null;
        refreshTargets();
      });
    };

    scheduleScan();

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("scroll", scheduleScan, true);
    window.addEventListener("resize", scheduleScan);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleScan, true);
      window.removeEventListener("resize", scheduleScan);
      if (scanFrame.current) window.cancelAnimationFrame(scanFrame.current);
    };
  }, [refreshTargets]);

  if (typeof document === "undefined" || !targets.length) return null;

  const toggleReveal = (id) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return createPortal(
    <div className="demo-reveal-layer" aria-label="Demo PHI reveal controls">
      {targets.map((target) => {
        const isRevealed = revealed.has(target.id);
        const displayValue = isRevealed ? target.encodedValue : target.token;

        return (
          <button
            key={target.id}
            type="button"
            className={"demo-reveal-overlay" + (isRevealed ? " revealed" : "")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleReveal(target.id);
            }}
            title={isRevealed ? "Click to mask this value" : "Click to reveal this value"}
            aria-label={isRevealed ? "Click to mask this demo value" : "Click to reveal this demo value"}
            style={{
              position: "fixed",
              left: target.rect.left + "px",
              top: target.rect.top + "px",
              width: Math.max(target.rect.width, 1) + "px",
              height: Math.max(target.rect.height, 1) + "px",
              zIndex: 2147483647,
              boxSizing: "border-box",
              display: "block",
              padding: 0,
              margin: 0,
              border: "0",
              borderBottom: isRevealed ? "1px solid currentColor" : "1px dotted currentColor",
              borderRadius: "1px",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              lineHeight: "inherit",
              textAlign: "left",
              whiteSpace: "pre",
              overflow: "hidden",
              cursor: "pointer",
              textDecoration: isRevealed ? "none" : "underline",
              textDecorationStyle: isRevealed ? "solid" : "dotted",
              textUnderlineOffset: "2px",
            }}
          >
            {displayValue}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
