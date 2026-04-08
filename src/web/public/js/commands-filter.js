/**
 * Commands public page — client-side filter & search.
 * SPA-compatible: guards against missing elements,
 * uses event delegation for tabs, cleans up keyboard shortcut.
 */
(function () {
  "use strict";

  // Cleanup previous instance (SPA re-execution)
  if (window.__cmdFilterCleanup) {
    window.__cmdFilterCleanup();
  }

  var searchInput = document.getElementById("cmd-search");
  var grid = document.getElementById("cmd-grid");
  var empty = document.getElementById("cmd-empty");

  // Guard: only run if commands page elements are present
  if (!searchInput || !grid) return;

  var cards = Array.from(grid.querySelectorAll(".cmd-card"));
  var activeCategory = "all";

  /* ---- Filter logic ---- */
  function filterCards() {
    var query = searchInput.value.trim().toLowerCase();
    var visible = 0;

    cards.forEach(function (card) {
      var cat = card.dataset.category;
      var name = card.dataset.name;
      var text = card.textContent.toLowerCase();

      var matchesCat = activeCategory === "all" || cat === activeCategory;
      var matchesSearch = !query || name.includes(query) || text.includes(query);

      var show = matchesCat && matchesSearch;
      card.hidden = !show;
      if (show) visible++;
    });

    if (empty) {
      empty.hidden = visible > 0;
    }
  }

  /* ---- Category tabs (event delegation on parent) ---- */
  var tagContainer = document.querySelector(".cmd-filter__tags");
  function handleTagClick(e) {
    var tag = e.target.closest(".cmd-tag");
    if (!tag) return;

    tagContainer.querySelectorAll(".cmd-tag").forEach(function (t) {
      t.classList.remove("cmd-tag--active");
      t.setAttribute("aria-selected", "false");
    });
    tag.classList.add("cmd-tag--active");
    tag.setAttribute("aria-selected", "true");
    activeCategory = tag.dataset.category;
    filterCards();
  }
  if (tagContainer) {
    tagContainer.addEventListener("click", handleTagClick);
  }

  /* ---- Search with debounce ---- */
  var debounceTimer;
  function handleSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(filterCards, 150);
  }
  searchInput.addEventListener("input", handleSearch);

  /* ---- Keyboard shortcut: / to focus search ---- */
  function handleKeydown(e) {
    if (
      e.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
    ) {
      // Only if commands page is active
      if (!document.getElementById("cmd-search")) return;
      e.preventDefault();
      searchInput.focus();
    }
  }
  document.addEventListener("keydown", handleKeydown);

  /* ---- SPA cleanup ---- */
  window.__cmdFilterCleanup = function () {
    document.removeEventListener("keydown", handleKeydown);
    clearTimeout(debounceTimer);
    window.__cmdFilterCleanup = null;
  };
})();
