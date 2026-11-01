document.addEventListener("DOMContentLoaded", () => {
  const includes = {
    "header-placeholder": "https://domg6027.github.io/dows6027/header.html",
    "nav-placeholder": "https://domg6027.github.io/dows6027/nav_bar.html",
    "footer-placeholder": "https://domg6027.github.io/dows6027/footer.html"
  };

  document.querySelectorAll("[data-include]").forEach(el => {
    const placeholder = el.getAttribute("data-include");
    const file = includes[placeholder];

    if (!file) {
      console.error("Unknown include placeholder:", placeholder);
      return;
    }

    fetch(file)
      .then(response => {
        if (!response.ok) throw new Error(`Cannot load ${file}`);
        return response.text();
      })
      .then(data => {
        el.innerHTML = data;
      })
      .catch(err => {
        console.error("Include error:", err);
        el.innerHTML = `<p style="color: red;">Error loading ${placeholder}</p>`;
      });
  });
});
