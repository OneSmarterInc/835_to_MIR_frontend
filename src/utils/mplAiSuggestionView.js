let installed = false;

function updateLabels() {
  document.querySelectorAll('.mpl-section-toggle').forEach((button) => {
    const title = button.querySelector('strong');
    if (!title || !/claim-wise ai response/i.test(title.textContent || '')) return;
    title.textContent = 'AI suggestion';
    const subtitle = title.parentElement?.querySelector('small');
    if (subtitle) {
      subtitle.textContent = 'Qwen professionally restates the Python-generated recommendations';
    }
  });

  document.querySelectorAll('.mpl-notice-ai-response .mpl-claim-response-heading').forEach((heading) => {
    const title = heading.querySelector('strong');
    if (title) title.textContent = 'AI suggestions';
  });
}

export function installMplAiSuggestionView() {
  if (installed || typeof document === 'undefined') return () => {};
  installed = true;
  updateLabels();
  const observer = new MutationObserver(updateLabels);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    installed = false;
  };
}
