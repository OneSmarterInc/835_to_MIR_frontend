import { useEffect } from "react";
import { getDemoRevealValue } from "../utils/demoEncoder";
import { isDemoModeEnabled } from "../utils/demoSubstitution";

function getTextPositionFromPoint(event) {
  if (typeof document === "undefined") return null;

  let range = null;

  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(event.clientX, event.clientY);
  } else if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(event.clientX, event.clientY);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }

  if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  return {
    node: range.startContainer,
    offset: range.startOffset,
  };
}

function revealTokenAtPoint(event) {
  const position = getTextPositionFromPoint(event);
  if (!position) return;

  const { node, offset } = position;
  const text = node.nodeValue || "";
  if (!text) return;

  const tokenPattern = /\S+/g;
  let match;

  while ((match = tokenPattern.exec(text))) {
    if (offset < match.index || offset > match.index + match[0].length) continue;

    const token = match[0];
    const encodedValue = getDemoRevealValue(token);
    if (!encodedValue || encodedValue === token) return;

    const start = match.index;
    const end = start + token.length;

    node.nodeValue = text.slice(0, start) + encodedValue + text.slice(end);
    return;
  }
}

export default function DemoRevealLayer() {
  useEffect(() => {
    if (!isDemoModeEnabled()) return undefined;

    const handleClick = (event) => {
      if (event.defaultPrevented) return;
      if (event.target.closest(".demo-reveal-layer")) return;
      if (event.target.closest('button,a,input,select,textarea,[contenteditable="true"]')) return;

      revealTokenAtPoint(event);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
