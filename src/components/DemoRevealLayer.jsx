import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getDemoRevealValue } from "../utils/demoEncoder";
import { isDemoModeEnabled } from "../utils/demoSubstitution";

function getTokenAtPoint(clientX, clientY) {
  let range = null;

  if (typeof document.caretRangeFromPoint === "function") {
    range = document.caretRangeFromPoint(clientX, clientY);
  } else if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(clientX, clientY);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }

  if (!range) return null;

  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.nodeValue || "";
  const offset = Math.min(range.startOffset, text.length);
  const tokenPattern = /\S+/g;
  let match;

  while ((match = tokenPattern.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) {
      const tokenRange = document.createRange();
      tokenRange.setStart(node, start);
      tokenRange.setEnd(node, end);
      const rect = tokenRange.getBoundingClientRect();
      return { token: match[0], rect };
    }
  }

  return null;
}

export default function DemoRevealLayer() {
  const [revealed, setRevealed] = useState(null);

  useEffect(() => {
    if (!isDemoModeEnabled()) {
      setRevealed(null);
      return undefined;
    }

    const handleClick = (event) => {
      if (event.target?.closest?.(".demo-reveal-overlay")) return;

      const hit = getTokenAtPoint(event.clientX, event.clientY);
      if (!hit) return;

      const encodedValue = getDemoRevealValue(hit.token);
      if (!encodedValue || encodedValue === hit.token) return;

      setRevealed({
        value: encodedValue,
        rect: hit.rect,
      });
    };

    const clearOnScroll = () => setRevealed(null);
    const clearOnResize = () => setRevealed(null);

    document.addEventListener("click", handleClick, true);
    window.addEventListener("scroll", clearOnScroll, true);
    window.addEventListener("resize", clearOnResize);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("scroll", clearOnScroll, true);
      window.removeEventListener("resize", clearOnResize);
    };
  }, []);

  if (!revealed || typeof document === "undefined") return null;

  const { rect, value } = revealed;

  return createPortal(
    <span
      className="demo-reveal-overlay"
      role="status"
      aria-label="Revealed demo value"
      onClick={(event) => {
        event.stopPropagation();
        setRevealed(null);
      }}
      style={{
        position: "fixed",
        left: rect.left + "px",
        top: rect.top + "px",
        minWidth: Math.max(rect.width, 1) + "px",
        minHeight: Math.max(rect.height, 1) + "px",
        zIndex: 2147483647,
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        padding: "0 1px",
        margin: 0,
        background: "inherit",
        color: "inherit",
        font: "inherit",
        lineHeight: "inherit",
        whiteSpace: "pre",
        cursor: "pointer",
      }}
      title="Click to hide"
    >
      {value}
    </span>,
    document.body,
  );
}
