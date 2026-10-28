(() => {
  const storageKey = 'claui-theme-v1';
  const root = document.documentElement;
  const validTheme = value => value === 'light' || value === 'dark';

  const applyTheme = (theme, save = false) => {
    root.dataset.theme = theme;
    const browserColor = document.querySelector('meta[name="theme-color"]');
    if (browserColor) browserColor.setAttribute('content', theme === 'light' ? '#f5f3ef' : '#070708');
    document.querySelectorAll('[data-theme-option]').forEach(button => {
      const selected = button.dataset.themeOption === theme;
      button.setAttribute('aria-pressed', String(selected));
      button.title = selected ? `${theme === 'light' ? 'Light' : 'Dark'} mode is on` : `Switch to ${button.dataset.themeOption} mode`;
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

  const connectPicker = () => {
    applyTheme(root.dataset.theme);
    document.querySelectorAll('[data-theme-option]').forEach(button => {
      button.addEventListener('click', () => applyTheme(button.dataset.themeOption, true));
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connectPicker, { once: true });
  else connectPicker();

  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) applyTheme(validTheme(event.newValue) ? event.newValue : 'dark');
  });
})();
