(() => {
  const storageKey = 'claui-theme-v1';
  const root = document.documentElement;
  const validTheme = value => value === 'light' || value === 'dark';

  const applyTheme = (theme, save = false) => {
    root.dataset.theme = theme;
    const browserColor = document.querySelector('meta[name="theme-color"]');
    if (browserColor) browserColor.setAttribute('content', theme === 'light' ? '#f5f3ef' : '#070708');
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const label = `Switch to ${nextTheme} mode`;
      button.setAttribute('aria-label', label);
      button.title = label;
    });
    if (save) {
      try { localStorage.setItem(storageKey, theme); } catch (_) { /* Theme still works when storage is unavailable. */ }
    }
  };

  let initialTheme = 'dark';
  try {
    const savedTheme = localStorage.getItem(storageKey);
    if (validTheme(savedTheme)) initialTheme = savedTheme;
  } catch (_) {}
  // This small script runs before styles load, so a saved light theme never flashes dark.
  applyTheme(initialTheme);

  const connectToggle = () => {
    applyTheme(root.dataset.theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connectToggle, { once: true });
  else connectToggle();

  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) applyTheme(validTheme(event.newValue) ? event.newValue : 'dark');
  });
})();
