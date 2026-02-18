document.addEventListener("DOMContentLoaded", () => {
  const navPlaceholder = document.getElementById("nav-placeholder");

  if (navPlaceholder) {
    fetch("/nav.html")
      .then((response) => response.text())
      .then((data) => {
        navPlaceholder.innerHTML = data;

        // Highlight the active link
        // This gets the current filename (e.g., 'about.html')
        const currentPage = window.location.pathname.split("/").pop() || "index.html";
        const links = navPlaceholder.querySelectorAll("nav a");

        links.forEach((link) => {
          if (link.getAttribute("href") === currentPage) {
            link.classList.add("active");
          }
        });
      })
      .catch((err) => console.error("Error loading navigation:", err));
  }
});