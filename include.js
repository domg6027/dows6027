document.addEventListener("DOMContentLoaded", () => {
  const includeTargets = document.querySelectorAll("[data-include]");

  includeTargets.forEach(el => {
    const file = el.getAttribute("data-include");
    if (!file) return;

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
        el.innerHTML = `<p style="color: red;">Error loading ${file}</p>`;
      });
  });
});
