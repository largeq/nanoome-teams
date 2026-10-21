import { allocate, defaultConfig, emptyVolunteers, InputError, MAX_VOLUNTEERS, normalizeConfig, normalizeVolunteer, totalCapacity, validateVolunteers } from "./allocation.js";
import { importVolunteers, toCsv } from "./csv.js";

const STORAGE_KEY = "phronesis.nanoome-allocation.v1";
const root = document.querySelector("#app");
const state = { config: defaultConfig(), volunteers: emptyVolunteers(20), result: null, tab: "input", draft: null, notice: null, saveStatus: "이 브라우저에 자동 저장", storageAvailable: true };
let saveTimer;

const icons = {
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2m0 3h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  file: '<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8m-8 4h8"/>',
};
const icon = (name) => `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ""}</svg>`;
const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const clone = (value) => JSON.parse(JSON.stringify(value));
const hasInput = () => state.volunteers.some((row) => Object.values(row).some((value) => String(value).trim()));
const modeCount = () => state.config.preference_mode === "three" ? 3 : 2;

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    const config = normalizeConfig(saved.config);
    if (!Array.isArray(saved.volunteers) || saved.volunteers.length !== totalCapacity(config)) throw new Error("저장 형식 오류");
    state.config = config;
    state.volunteers = saved.volunteers.map(normalizeVolunteer);
    state.saveStatus = "지난 명단을 불러왔습니다";
  } catch {
    state.notice = { kind: "info", messages: ["브라우저에 저장된 명단을 불러오지 못했습니다. 저장해 둔 CSV가 있다면 불러와 주세요."] };
  }
}

function save() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, config: state.config, volunteers: state.volunteers }));
    state.storageAvailable = true;
    state.saveStatus = "이 브라우저에 저장됨";
  } catch {
    state.storageAvailable = false;
    state.saveStatus = "자동 저장 불가 · CSV로 저장해 주세요";
  }
  const label = document.querySelector("#save-status");
  if (label) label.textContent = state.saveStatus;
}

function scheduleSave() {
  state.saveStatus = "저장 중…";
  const label = document.querySelector("#save-status");
  if (label) label.textContent = state.saveStatus;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
}

function notify(messages, kind = "error") {
  state.notice = { messages: Array.isArray(messages) ? messages : [messages], kind };
  renderNotice();
  if (kind === "error") document.querySelector("#notice")?.focus();
}

function renderNotice() {
  const box = document.querySelector("#notice");
  if (!box) return;
  const notice = state.notice;
  box.className = notice ? `notice ${notice.kind}` : "notice hidden";
  box.setAttribute("role", notice?.kind === "error" ? "alert" : "status");
  box.innerHTML = notice ? `<div><strong>${notice.kind === "error" ? "입력을 확인해 주세요" : "안내"}</strong><ul>${notice.messages.map((message) => `<li>${escape(message)}</li>`).join("")}</ul></div><button class="icon-button" data-action="dismiss" aria-label="안내 닫기">×</button>` : "";
}

function clearResult() {
  state.result = null;
  const badge = document.querySelector("#result-indicator");
  if (badge) badge.textContent = "배정 후 확인";
}

function sidebar() {
  return `<aside class="sidebar" aria-label="작업 메뉴">
    <a class="brand" href="./" aria-label="나눔교실 팀 배정 처음 화면"><img src="./favicon.svg" width="38" height="38" alt=""/><span>나눔교실<small>PHRONESIS</small></span></a>
    <div class="sidebar-label">팀 배정</div>
    <nav class="navigation" aria-label="배정 단계">
      ${[["input", "people", "나누미 입력", "이름과 지망을 모아요"], ["result", "grid", "배정 결과", state.result ? "배정이 완료되었습니다" : "배정 후 확인"], ["settings", "settings", "프로그램 설정", "프로그램과 정원을 정해요"]].map(([tab, glyph, label, description]) => `<button class="nav-item ${state.tab === tab ? "active" : ""}" data-tab="${tab}" ${state.tab === tab ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${label}<small ${tab === "result" ? 'id="result-indicator"' : ""}>${description}</small></span>${state.tab === tab ? '<span class="active-dot"></span>' : ""}</button>`).join("")}
    </nav>
    <div class="sidebar-note">${icon("shield")}<strong>명단은 내 브라우저 안에</strong><p>입력한 이름과 지망을<br/>서버로 전송하지 않습니다.</p></div>
    <div class="sidebar-bottom"><span class="status-dot"></span><span id="save-status">${escape(state.saveStatus)}</span></div>
    <div class="version">나눔교실 팀 배정</div>
  </aside>`;
}

function stats(items) {
  return `<div class="stats">${items.map(([label, value, suffix, glyph, id]) => `<div class="stat"><span class="stat-label">${label}</span><div><strong ${id ? `id="${id}"` : ""}>${value}</strong><span>${suffix}</span></div><span class="stat-icon">${icon(glyph)}</span></div>`).join("")}</div>`;
}

function selectedOptions(row, rank) {
  return `<option value="">선택해 주세요</option>${state.config.subjects.map((subject) => `<option value="${escape(subject.name)}" ${row[`pref${rank}`] === subject.name ? "selected" : ""}>${escape(subject.name)}</option>`).join("")}`;
}

function inputView() {
  const completed = state.volunteers.filter((row) => row.name.trim() && row.pref1).length;
  return `<section class="intro"><div class="eyebrow">함께할 팀을 찾는 첫걸음</div><h1 id="page-title">나누미 입력</h1><p>각자의 지망을 모아, 더 만족스러운 팀을 만들어 보세요.</p></section>
    ${stats([["전체 정원", totalCapacity(state.config), "명", "people"], ["입력 완료", completed, `/ ${totalCapacity(state.config)}명`, "check", "completed-count"], ["지망 선택", modeCount(), "개까지", "file"]])}
    <section class="card input-card" aria-labelledby="input-title">
      <div class="card-heading"><div><h2 id="input-title">우리의 지망 목록 <span class="badge neutral">최대 ${MAX_VOLUNTEERS}명</span></h2><p>이름과 1지망은 필수예요. 나머지 지망은 비워 두어도 됩니다.</p></div></div>
      <div class="table-tools"><div class="tool-buttons"><button class="button compact" data-action="import">${icon("upload")}CSV 불러오기</button><button class="button compact" data-action="paste">붙여넣기</button></div><button class="text-button" data-action="template">${icon("download")}입력 양식 받기</button></div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="나누미 명단 입력 표. 아래로 스크롤해 모든 행을 입력할 수 있습니다."><table class="input-table"><thead><tr><th class="number-col" scope="col">번호</th><th scope="col">이름 <span class="required">*</span></th>${Array.from({ length: modeCount() }, (_, index) => `<th scope="col">${index + 1}지망 ${index === 0 ? '<span class="required">*</span>' : '<span class="optional">선택</span>'}</th>`).join("")}</tr></thead><tbody>${state.volunteers.map((row, index) => `<tr><th scope="row" class="row-number">${String(index + 1).padStart(2, "0")}</th><td><input autocomplete="off" type="text" maxlength="100" data-index="${index}" data-field="name" aria-label="${index + 1}번 이름" placeholder="이름 입력" value="${escape(row.name)}"/></td>${Array.from({ length: modeCount() }, (_, rank) => `<td><select data-index="${index}" data-field="pref${rank + 1}" aria-label="${index + 1}번 ${rank + 1}지망">${selectedOptions(row, rank + 1)}</select></td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="card-bottom"><span class="small-muted" id="progress-text">${completed}명의 입력이 완료되었습니다</span><span class="small-muted">프로그램과 정원은 설정에서 바꿀 수 있어요.</span></div>
    </section>
    <div class="action-bar"><div class="tool-buttons"><button class="button" data-action="save-input">${icon("download")}명단 저장</button><button class="text-button muted" data-action="clear">명단 비우기</button></div><button class="button primary" data-action="allocate">배정 실행${icon("arrow")}</button></div>
    <p class="bottom-hint">${icon("shield")}자동 저장은 이 브라우저에서만 유지됩니다. 중요한 명단은 CSV로 저장해 주세요.</p>`;
}

function resultView() {
  if (!state.result) return `<section class="intro"><div class="eyebrow">우리에게 맞는 팀</div><h1 id="page-title">배정 결과</h1><p>나누미의 지망을 바탕으로 팀을 구성합니다.</p></section><section class="card empty-state"><div class="empty-icon">${icon("grid")}</div><h2>아직 배정 결과가 없어요</h2><p>명단을 입력하고 배정을 실행해 주세요.</p><button class="button primary" data-tab="input">나누미 입력으로${icon("arrow")}</button></section>`;
  const result = state.result;
  const first = result.rows.filter((row) => row.rank === 1).length;
  const within = result.rows.filter((row) => row.rank !== 99).length;
  return `<section class="intro"><div class="eyebrow">모두의 지망을 함께 고려했어요</div><h1 id="page-title">배정 결과</h1><p>정원을 지키면서 전체 지망 비용의 합이 가장 작은 조합을 찾았습니다.</p></section>
    ${stats([["1지망 배정", first, "명", "check"], ["지망 내 배정", within, `/ ${result.rows.length}명`, "people"], ["미지망 배정", result.rows.length - within, "명", "grid"]])}
    <section class="card" aria-labelledby="team-title"><div class="card-heading"><div><h2 id="team-title">프로그램별 팀 구성</h2><p>함께할 나누미를 한눈에 확인하세요.</p></div><span class="badge success">${icon("check")}전체 정원 충족</span></div><div class="team-grid">${result.summary.map((team, index) => `<article class="team"><div class="team-heading"><span class="subject-mark mark-${index % 5}">${escape(team.subject.slice(0, 1))}</span><h3>${escape(team.subject)}</h3><span>${team.names.length} / ${team.capacity}명</span></div><div class="member-list">${team.names.map((name) => `<span class="member">${escape(name)}</span>`).join("")}</div></article>`).join("")}</div></section>
    <section class="card result-card" aria-labelledby="result-title"><div class="card-heading"><div><h2 id="result-title">나누미별 배정표</h2><p>입력한 지망과 배정된 프로그램을 함께 확인하세요.</p></div><span class="small-muted">총 비용 ${result.cost}점</span></div><div class="table-scroll result-scroll" tabindex="0" role="region" aria-label="나누미별 배정 결과"><table><thead><tr><th scope="col" class="number-col">번호</th><th scope="col">이름</th>${Array.from({ length: modeCount() }, (_, index) => `<th scope="col">${index + 1}지망</th>`).join("")}<th scope="col">배정 프로그램</th><th scope="col">배정 순위</th></tr></thead><tbody>${result.rows.map((row) => `<tr><th scope="row" class="row-number">${row.id}</th><td class="name-cell">${escape(row.name)}</td>${Array.from({ length: modeCount() }, (_, index) => `<td class="preference-cell">${escape(row[`pref${index + 1}`] || "—")}</td>`).join("")}<td class="assigned-cell">${escape(row.assigned)}</td><td><span class="badge ${row.rank === 1 ? "success" : row.rank === 99 ? "warning" : "neutral"}">${row.match_label}</span></td></tr>`).join("")}</tbody></table></div></section>
    <div class="action-bar"><button class="button" data-tab="input">명단으로 돌아가기</button><div class="tool-buttons"><button class="button" data-action="print">인쇄 / PDF</button><button class="button primary" data-action="save-result">${icon("download")}결과 CSV 저장</button></div></div>
    <p class="bottom-hint">1지망 0점 · 2지망 1점${modeCount() === 3 ? " · 3지망 2점" : ""} · 미지망 10점으로 계산합니다. 미지망 배정도 발생할 수 있습니다.</p>`;
}

function settingsView() {
  const draft = state.draft;
  return `<section class="intro"><div class="eyebrow">이번 활동에 맞게 준비해요</div><h1 id="page-title">프로그램 설정</h1><p>운영할 프로그램과 정원, 받을 지망 수를 정해 주세요.</p></section>
    <div class="settings-grid"><section class="card"><div class="card-heading"><div><h2>프로그램과 정원</h2><p>전체 정원만큼 명단 입력 칸이 만들어집니다.</p></div></div><div class="settings-table"><table><thead><tr><th scope="col">프로그램 이름</th><th scope="col" class="capacity-col">정원</th><th scope="col"><span class="sr-only">삭제</span></th></tr></thead><tbody>${draft.subjects.map((subject, index) => `<tr><td><input data-subject="${index}" data-setting="name" type="text" maxlength="40" aria-label="${index + 1}번째 프로그램 이름" placeholder="프로그램 이름" value="${escape(subject.name)}"/></td><td><div class="capacity-input"><input data-subject="${index}" data-setting="capacity" type="number" min="1" max="30" step="1" aria-label="${index + 1}번째 프로그램 정원" value="${subject.capacity}"/><span>명</span></div></td><td><button class="icon-button delete-program" data-action="remove-program" data-subject="${index}" aria-label="${index + 1}번째 프로그램 삭제" ${draft.subjects.length === 1 ? "disabled" : ""}>${icon("trash")}</button></td></tr>`).join("")}</tbody></table></div><div class="settings-total"><button class="text-button" data-action="add-program">${icon("plus")}프로그램 추가</button><span>전체 정원 <strong id="draft-total">${totalCapacity(draft)}</strong> / ${MAX_VOLUNTEERS}명</span></div></section>
    <section class="card preference-card"><div class="card-heading"><div><h2>받을 지망 수</h2><p>봉사자에게 몇 지망까지 받을까요?</p></div></div><div class="mode-options">${[["two", "1~2지망", "두 가지 선호를 받습니다"], ["three", "1~3지망", "세 가지 선호를 받습니다"]].map(([mode, label, description]) => `<label class="mode-option"><input type="radio" name="preference-mode" value="${mode}" ${draft.preference_mode === mode ? "checked" : ""}/><span><strong>${label}</strong><small>${description}</small></span></label>`).join("")}</div><div class="settings-tip">${icon("help")}<p>1지망은 필수이며, 2·3지망은 선택입니다. 배정은 전체 비용의 합을 기준으로 합니다.</p></div></section></div>
    <div class="action-bar"><button class="button" data-action="cancel-settings">취소</button><button class="button primary" data-action="save-settings">설정 적용${icon("check")}</button></div>`;
}

function dialogs() {
  return `<input id="csv-file" class="hidden" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"/>
    <dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-top"><h2 id="help-title">어떻게 배정하나요?</h2><button class="icon-button" data-action="close-dialog" aria-label="배정 기준 닫기">×</button></div><div class="dialog-content"><p>각 프로그램을 정원만큼의 자리로 나누고, 모든 나누미에게 한 자리씩 배정합니다.</p><div class="cost-list"><span>1지망 <strong>0점</strong></span><span>2지망 <strong>1점</strong></span><span>3지망 <strong>2점</strong></span><span>미지망 <strong>10점</strong></span></div><p><strong>헝가리안 알고리즘</strong>으로 전체 점수의 합이 가장 작은 조합을 찾습니다. 3지망 점수는 3지망을 받는 설정에서만 사용합니다.</p><p>특정 프로그램에 지망이 몰리면 미지망 배정이 발생할 수 있습니다. 현재는 전공이나 경력에 별도 점수를 주지 않습니다.</p><p>최소 점수가 같은 조합이 여러 개라면 그중 하나를 선택합니다. 모든 사람의 1지망이나 미지망 인원 최소화를 별도로 보장하는 방식은 아닙니다.</p><p class="small-muted">현재 도구는 1~30명을 지원하며, 전체 정원과 명단 인원이 같아야 합니다.</p></div><div class="dialog-actions"><button class="button primary" data-action="close-dialog">알겠습니다</button></div></dialog>
    <dialog id="paste-dialog" aria-labelledby="paste-title"><div class="dialog-top"><h2 id="paste-title">명단 붙여넣기</h2><button class="icon-button" data-action="close-dialog" aria-label="붙여넣기 닫기">×</button></div><div class="dialog-content"><p id="paste-description">엑셀에서 복사한 표 또는 CSV를 붙여넣어 주세요.<br/>열은 이름, 1지망, 2지망${modeCount() === 3 ? ", 3지망" : ""} 순서입니다.</p><textarea id="paste-text" aria-label="붙여넣을 명단" aria-describedby="paste-description" rows="9" placeholder="엑셀에서 복사한 명단을 여기에 붙여넣으세요."></textarea><p class="small-muted">전체 ${totalCapacity(state.config)}명의 명단을 입력해 주세요. 적용하면 현재 명단을 교체합니다.</p></div><div class="dialog-actions"><button class="button" data-action="close-dialog">취소</button><button class="button primary" data-action="apply-paste">명단에 적용</button></div></dialog>`;
}

function render() {
  root.innerHTML = `<div class="app-shell">${sidebar()}<main id="main" tabindex="-1"><header class="topbar"><span>나눔교실 <span class="breadcrumb">/</span> 팀 배정</span><button class="text-button" data-action="help">${icon("help")}배정 기준</button></header><div class="workspace"><div id="notice" class="notice hidden" tabindex="-1"></div>${state.tab === "input" ? inputView() : state.tab === "result" ? resultView() : settingsView()}<footer class="page-footer"><span>각자의 마음을 모아, 함께하는 나눔교실.</span><span>PHRONESIS · NANUM CLASS</span></footer></div></main></div>${dialogs()}`;
  renderNotice();
}

function switchTab(tab) {
  if (!["input", "result", "settings"].includes(tab) || tab === state.tab) return;
  if (state.tab === "settings" && JSON.stringify(state.draft) !== JSON.stringify(state.config) && !confirm("아직 적용하지 않은 설정이 있습니다. 변경 내용을 버리고 이동할까요?")) return;
  state.tab = tab;
  state.notice = null;
  state.draft = tab === "settings" ? clone(state.config) : null;
  render();
  document.querySelector("#main").focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function download(filename, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function inputCsvRows(volunteers = state.volunteers) {
  return [["이름", "1지망", "2지망", ...(modeCount() === 3 ? ["3지망"] : [])], ...volunteers.map((row) => [row.name, row.pref1, row.pref2, ...(modeCount() === 3 ? [row.pref3] : [])])];
}

function applyImport(text) {
  const volunteers = importVolunteers(text);
  const errors = validateVolunteers(state.config, volunteers);
  if (errors.length) throw new InputError(errors);
  if (hasInput() && !confirm("불러온 명단으로 현재 명단을 교체할까요? 기존 명단은 '명단 저장'으로 보관할 수 있습니다.")) return false;
  state.volunteers = volunteers;
  state.tab = "input";
  clearResult(); save();
  state.notice = { kind: "info", messages: [`${volunteers.length}명의 명단을 불러왔습니다.`] };
  render();
  return true;
}

const actions = {
  help: () => document.querySelector("#help-dialog").showModal(),
  paste: () => document.querySelector("#paste-dialog").showModal(),
  "close-dialog": (button) => button.closest("dialog").close(),
  dismiss: () => { state.notice = null; renderNotice(); },
  import: () => document.querySelector("#csv-file").click(),
  template: () => download("나눔교실_명단_입력양식.csv", inputCsvRows(emptyVolunteers(totalCapacity(state.config)))),
  "save-input": () => { save(); download("나눔교실_명단.csv", inputCsvRows()); },
  "save-result": () => {
    if (!state.result) return;
    download("나눔교실_배정결과.csv", [["번호", "이름", "1지망", "2지망", ...(modeCount() === 3 ? ["3지망"] : []), "배정 프로그램", "배정 순위"], ...state.result.rows.map((row) => [row.id, row.name, row.pref1, row.pref2, ...(modeCount() === 3 ? [row.pref3] : []), row.assigned, row.match_label])]);
  },
  print: () => window.print(),
  clear: () => {
    if (hasInput() && !confirm("현재 명단을 모두 비울까요? 프로그램 설정은 유지됩니다.")) return;
    state.volunteers = emptyVolunteers(totalCapacity(state.config)); clearResult(); save(); state.notice = null; render();
  },
  allocate: () => {
    state.result = allocate(state.config, state.volunteers);
    save(); state.tab = "result"; state.notice = null; render();
    document.querySelector("#main").focus({ preventScroll: true }); window.scrollTo({ top: 0 });
  },
  "apply-paste": () => {
    try { applyImport(document.querySelector("#paste-text").value); }
    catch (error) { document.querySelector("#paste-dialog").close(); throw error; }
  },
  "add-program": () => {
    if (state.draft.subjects.length >= MAX_VOLUNTEERS) throw new InputError(["프로그램은 최대 30개까지 만들 수 있습니다."]);
    state.draft.subjects.push({ name: "", capacity: 1 }); render();
    document.querySelector(`[data-subject="${state.draft.subjects.length - 1}"][data-setting="name"]`).focus();
  },
  "remove-program": (button) => {
    if (state.draft.subjects.length > 1) state.draft.subjects.splice(Number(button.dataset.subject), 1);
    render();
  },
  "cancel-settings": () => { state.draft = clone(state.config); switchTab("input"); },
  "save-settings": () => {
    const config = normalizeConfig(state.draft);
    const count = totalCapacity(config), allowed = new Set(config.subjects.map((subject) => subject.name));
    const dropped = state.volunteers.slice(count).some((row) => Object.values(row).some(Boolean));
    if (dropped && !confirm(`정원이 줄어 마지막 ${state.volunteers.length - count}개의 입력 행이 삭제됩니다. 계속할까요?`)) return;
    const next = emptyVolunteers(count);
    let cleared = 0;
    for (let index = 0; index < Math.min(count, state.volunteers.length); index++) {
      next[index] = { ...state.volunteers[index] };
      for (const field of ["pref1", "pref2", "pref3"]) {
        if (next[index][field] && !allowed.has(next[index][field])) { next[index][field] = ""; cleared++; }
      }
      if (config.preference_mode === "two") next[index].pref3 = "";
    }
    state.config = config; state.volunteers = next; clearResult(); save();
    state.draft = null; state.tab = "input";
    state.notice = { kind: "info", messages: [`설정을 적용했습니다. 전체 정원은 ${count}명입니다.${cleared ? " 변경된 프로그램에 해당하는 지망을 다시 선택해 주세요." : ""}`] };
    render();
  },
};

root.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action], [data-tab]");
  if (!button || button.disabled) return;
  try {
    if (button.dataset.tab) switchTab(button.dataset.tab);
    else actions[button.dataset.action]?.(button);
  } catch (error) {
    notify(error instanceof InputError ? error.messages : "처리 중 문제가 발생했습니다. 입력 내용을 확인하고 다시 시도해 주세요.");
  }
});

root.addEventListener("input", (event) => {
  const element = event.target;
  if (element.dataset.field && element.tagName === "INPUT") updateVolunteer(element);
  if (element.dataset.setting) {
    state.draft.subjects[Number(element.dataset.subject)][element.dataset.setting] = element.dataset.setting === "capacity" ? Number(element.value) : element.value;
    document.querySelector("#draft-total").textContent = totalCapacity(state.draft);
  }
});

function updateVolunteer(element) {
  state.volunteers[Number(element.dataset.index)][element.dataset.field] = element.value;
  clearResult(); scheduleSave();
  if (state.notice) { state.notice = null; renderNotice(); }
  const count = state.volunteers.filter((row) => row.name.trim() && row.pref1).length;
  document.querySelector("#completed-count").textContent = count;
  document.querySelector("#progress-text").textContent = `${count}명의 입력이 완료되었습니다`;
}

root.addEventListener("change", async (event) => {
  const element = event.target;
  if (element.dataset.field && element.tagName === "SELECT") updateVolunteer(element);
  if (element.name === "preference-mode") state.draft.preference_mode = element.value;
  if (element.id === "csv-file") {
    const file = element.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new InputError(["2MB 이하의 CSV 파일을 사용해 주세요."]);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.includes(0)) throw new InputError(["UTF-8 CSV 파일로 저장한 뒤 다시 불러와 주세요. 엑셀 표는 '붙여넣기'도 사용할 수 있습니다."]);
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new InputError(["한글이 깨지지 않도록 'CSV UTF-8' 형식으로 저장해 주세요."]); }
      applyImport(text);
    } catch (error) { notify(error instanceof InputError ? error.messages : "파일을 읽을 수 없습니다. CSV 내용을 확인해 주세요."); }
    finally { element.value = ""; }
  }
});

window.addEventListener("pagehide", save);
restore();
render();
