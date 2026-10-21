const tabs = Array.from(document.querySelectorAll("[data-tab]"));
const panels = { screen: document.querySelector("#screen-panel"), system: document.querySelector("#system-panel") };

function selectTab(name, updateHash = true) {
  if (!(name in panels)) name = "screen";
  for (const tab of tabs) {
    const active = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== name;
  if (updateHash) history.replaceState(null, "", `#${name}`);
}

for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.indexOf(tab);
    const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[index].focus();
    selectTab(tabs[index].dataset.tab);
  });
}

for (const button of document.querySelectorAll("[data-width]")) {
  if (button.tagName !== "BUTTON") continue;
  button.addEventListener("click", () => {
    document.querySelector(".preview-stage").dataset.width = button.dataset.width;
    for (const option of document.querySelectorAll("button[data-width]")) option.setAttribute("aria-pressed", String(option === button));
  });
}

for (const button of document.querySelectorAll("[data-specimen]")) {
  button.addEventListener("click", () => { document.querySelector("#specimen-output").textContent = button.dataset.specimen; });
}

window.addEventListener("hashchange", () => selectTab(location.hash.slice(1), false));
selectTab(location.hash.slice(1), false);
