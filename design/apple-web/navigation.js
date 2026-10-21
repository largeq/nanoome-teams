// Keep local navigation inside this design preview despite the document's base URL.
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".brand")) {
    event.preventDefault();
    document.querySelector('.navigation [data-tab="input"]')?.click();
  }
  if (target?.closest(".skip-link")) {
    event.preventDefault();
    document.querySelector("#main")?.focus();
  }
}, { capture: true });
