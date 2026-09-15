function enhanceReconciliationPage(shell) {
  if (!(shell instanceof HTMLElement) || shell.dataset.pageEnhanced === "1") return;
  shell.dataset.pageEnhanced = "1";
  shell.classList.add("recon-page-shell");
  shell.removeAttribute("role");

  const page = shell.querySelector(".recon-popup");
  if (page) {
    page.classList.add("recon-page");
    page.setAttribute("role", "main");
    page.removeAttribute("aria-modal");
  }

  const header = shell.querySelector(".recon-popup-header");
  if (header) header.classList.add("recon-page-header");

  const body = shell.querySelector(".recon-popup-body");
  if (body) body.classList.add("recon-page-body");

  const closeButton = shell.querySelector(".recon-popup-header .modal-cross-btn");
  if (closeButton) {
    closeButton.className = "recon-page-back-button";
    closeButton.textContent = "← Back to Reconciliation";
    closeButton.setAttribute("aria-label", "Back to reconciliation results");
    closeButton.setAttribute("title", "Back to reconciliation results");
  }
}

export function installReconciliationPageEnhancement() {
  const refresh = () => {
    document.querySelectorAll(".recon-popup-backdrop").forEach(enhanceReconciliationPage);
  };
  refresh();
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
