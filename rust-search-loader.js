let wasmModulePromise = null;

async function loadRustSearch() {
  if (!wasmModulePromise) {
    wasmModulePromise = import('./rust_search/pkg/rust_search.js');
  }
  return wasmModulePromise;
}

async function rankLinksRust(links, target) {
  const module = await loadRustSearch();
  return module.rank_links(links, target);
}

async function findPathHintRust(start, target, links) {
  const module = await loadRustSearch();
  return module.find_path_hint(start, target, links);
}

window.RustSearch = {
  loadRustSearch,
  rankLinksRust,
  findPathHintRust,
};
