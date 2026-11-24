(function () {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem('datchord_theme') || 'system';
    var accent = localStorage.getItem('datchord_accent') || 'tangerine';
    var density = localStorage.getItem('datchord_density') || 'cozy';
    var reduced = localStorage.getItem('datchord_reduce_motion') === 'true';
    var resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    root.setAttribute('data-theme', resolved === 'light' ? 'light' : 'dark');
    root.setAttribute('data-theme-preference', theme);
    root.setAttribute('data-accent', accent);
    root.setAttribute('data-density', density);
    if (reduced) root.setAttribute('data-reduce-motion', 'true');
    var language = localStorage.getItem('datchord_lang');
    if (!language) {
      var candidates = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
      var supported = ['en', 'es', 'fr', 'ar', 'pt-BR'];
      for (var i = 0; i < candidates.length; i += 1) {
        var candidate = String(candidates[i]);
        if (supported.indexOf(candidate) !== -1) { language = candidate; break; }
        var base = candidate.split('-')[0];
        if (base === 'pt') { language = 'pt-BR'; break; }
        if (supported.indexOf(base) !== -1) { language = base; break; }
      }
    }
    language = language || 'en';
    root.setAttribute('lang', language);
    root.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  } catch (error) {
    /* Keep sensible defaults when storage is unavailable. */
  }
})();
