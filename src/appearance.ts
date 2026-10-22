(() => {
  let preference = "system";
  try {
    preference = localStorage.getItem("reqnote-theme-v1") || "system";
  } catch {}
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
