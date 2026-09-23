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

    const fragment = document.createDocumentFragment();

    if (start > 0) {
      fragment.appendChild(document.createTextNode(text.slice(0, start)));
    }

    const revealedValue = document.createElement("span");
    revealedValue.className = "demo-revealed-value";
    revealedValue.textContent = encodedValue;
    revealedValue.dataset.maskedValue = token;
    revealedValue.title = "Click to mask";
    revealedValue.style.cursor = "pointer";
    fragment.appendChild(revealedValue);

    if (end < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(end)));
    }

    node.parentNode.replaceChild(fragment, node);
    return;
  }
}

export default function DemoRevealLayer() {
  useEffect(() => {
    if (!isDemoModeEnabled()) return undefined;

    const style = document.createElement("style");
    style.setAttribute("data-demo-reveal-style", "true");
    style.textContent = `
      .demo-revealed-value {
        cursor: pointer !important;
      }
    `;
    document.head.appendChild(style);

    const handleClick = (event) => {
      if (event.defaultPrevented) return;
      if (event.target.closest(".demo-reveal-layer")) return;
      if (event.target.closest('button,a,input,select,textarea,[contenteditable="true"]')) return;
      const revealedValue = event.target.closest(".demo-revealed-value");
      if (revealedValue) {
        const maskedValue = revealedValue.dataset.maskedValue;
        if (maskedValue && revealedValue.parentNode) {
          revealedValue.parentNode.replaceChild(
            document.createTextNode(maskedValue),
            revealedValue,
          );
        }
        return;
      }

      revealTokenAtPoint(event);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      style.remove();
    };
  }, []);

  return null;
}
