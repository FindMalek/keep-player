// The app has no motion. Hidden tabs still pause what keeps moving (the loader, the progress line): marked for app.css.
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => document.documentElement.toggleAttribute("data-hidden", document.hidden));
