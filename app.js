import { allocate, defaultConfig, emptyVolunteers, InputError, MAX_VOLUNTEERS, normalizeConfig, normalizeVolunteer, totalCapacity } from "./allocation.js";
import { planClipboardPaste } from "./clipboard.js";
import { toCsv } from "./csv.js";

const STORAGE_KEY = "phronesis.nanoome-allocation.v1";
const SUPPORT_EMAIL = "anglers-jazzier-9z@icloud.com";
const root = document.querySelector("#app");
const state = {
  config: defaultConfig(), volunteers: [], programs: [],
  result: null, resultConfig: null, resultStale: false, tab: "input", draft: null,
  notice: null, saveStatus: "이 브라우저에 자동 저장", storageAvailable: true,
};
state.programs = state.config.subjects.map((subject, index) => ({ ...subject, key: "program-" + index, enabled: true }));
state.volunteers = emptyVolunteers(totalCapacity(state.config));
let saveTimer, dragDepth = 0;

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

const enabledPrograms = () => state.programs.filter((program) => program.enabled);
const rowHasInput = (row) => Object.values(row).some((value) => String(value).trim());
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const noticeMarkup = () => '<div id="notice" class="notice hidden" tabindex="-1"></div>';

function syncConfig() {
  state.config.subjects = enabledPrograms().map(({ name, capacity }) => ({ name, capacity }));
}

function resizeVolunteers(count, volunteers = state.volunteers) {
  return Array.from({ length: count }, (_, index) => volunteers[index] ? { ...volunteers[index] } : normalizeVolunteer({}));
}

function removedRowsMessage(count) {
  const dropped = state.volunteers.slice(count).filter(rowHasInput).length;
  return dropped ? "정원을 줄이면 마지막 " + dropped + "명의 입력 내용이 삭제됩니다." : "";
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw), config = normalizeConfig(saved.config);
    if (!Array.isArray(saved.volunteers) || !saved.volunteers.length || saved.volunteers.length > MAX_VOLUNTEERS) throw new Error("저장 형식 오류");
    const programs = saved.programs ?? config.subjects.map((subject, index) => ({ ...subject, key: "program-" + index, enabled: true }));
    if (!Array.isArray(programs) || !programs.length || programs.length > MAX_VOLUNTEERS ||
      programs.some((program) => typeof program.key !== "string" || !program.key || typeof program.name !== "string" || !program.name.trim() || program.name.length > 40 || typeof program.enabled !== "boolean" || !Number.isInteger(program.capacity) || program.capacity < 1 || program.capacity > MAX_VOLUNTEERS) ||
      new Set(programs.map((program) => program.key)).size !== programs.length ||
      new Set(programs.map((program) => program.name)).size !== programs.length) throw new Error("저장 과목 오류");
    const subjects = programs.filter((program) => program.enabled).map(({ name, capacity }) => ({ name, capacity }));
    if (JSON.stringify(subjects) !== JSON.stringify(config.subjects)) throw new Error("저장 과목 불일치");
    const volunteers = saved.volunteers.map(normalizeVolunteer);
    state.config = config;
    state.programs = programs.map((program) => ({ ...program }));
    state.volunteers = volunteers;
    // Older versions saved roster size separately; preserve every filled row.
    const occupied = volunteers.reduce((last, row, index) => rowHasInput(row) ? index + 1 : last, 0);
    if (occupied > totalCapacity(state.config)) {
      const program = enabledPrograms().at(-1);
      program.capacity += occupied - totalCapacity(state.config);
      syncConfig();
      state.notice = { kind: "info", messages: ["저장된 명단을 모두 유지하도록 " + program.name + " 정원을 " + program.capacity + "명으로 조정했습니다. 과목별 정원을 확인해 주세요."] };
    }
    state.volunteers = resizeVolunteers(totalCapacity(state.config));
    state.saveStatus = "지난 명단을 불러왔습니다";
  } catch {
    state.notice = { kind: "info", messages: ["저장된 명단을 불러오지 못했습니다. 보관한 CSV나 엑셀 명단이 있다면 불러와 주세요."] };
  }
}

function save() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, config: state.config, programs: state.programs, volunteers: state.volunteers }));
    state.storageAvailable = true; state.saveStatus = "이 브라우저에 저장됨";
  } catch {
    state.storageAvailable = false; state.saveStatus = "자동 저장 불가 · CSV로 저장해 주세요";
  }
  const label = document.querySelector("#save-status");
  if (label) label.textContent = state.saveStatus;
}

function scheduleSave() {
  state.saveStatus = "저장 중…";
  const label = document.querySelector("#save-status");
  if (label) label.textContent = state.saveStatus;
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 250);
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
  box.className = notice ? "notice " + notice.kind : "notice hidden";
  box.setAttribute("role", notice?.kind === "error" ? "alert" : "status");
  box.innerHTML = notice ? '<div><strong>' + (notice.kind === "error" ? "입력을 확인해 주세요" : "안내") + '</strong><ul>' + notice.messages.map((message) => "<li>" + escape(message) + "</li>").join("") + '</ul></div><button class="icon-button" data-action="dismiss" aria-label="안내 닫기">×</button>' : "";
}

function changed() {
  if (state.result && !state.resultStale) {
    state.resultStale = true;
    document.querySelector("#allocation-result")?.classList.remove("result-reveal");
    refreshResult();
  }
  state.notice = null; renderNotice();
}

function clearResult() { state.result = null; state.resultConfig = null; state.resultStale = false; }

function sidebar() {
  return '<aside class="sidebar" aria-label="작업 메뉴">' +
    '<a class="brand" href="./" aria-label="나눔교실 팀 배정 처음 화면"><img src="./favicon.svg?v=nanum-hands" width="38" height="38" alt=""/><span>나눔교실<small>PHRONESIS</small></span></a>' +
    '<nav class="navigation" aria-label="주요 메뉴">' +
    [["input","팀 배정"],["about","서비스 소개"]].map(([tab,label]) => '<button class="nav-item ' + (state.tab === tab ? "active" : "") + '" data-tab="' + tab + '" ' + (state.tab === tab ? 'aria-current="page"' : "") + '><span>' + label + "</span></button>").join("") +
    '</nav><div class="sidebar-bottom"><span class="status-dot"></span><span id="save-status">' + escape(state.saveStatus) + "</span></div></aside>";
}

function stepper({ value, label, field, index = "", min = 1, max = MAX_VOLUNTEERS }) {
  const id = "stepper-" + field + (index !== "" ? "-" + index : "");
  return '<div class="flow-stepper"><button type="button" data-action="step" data-control="' + field + '" data-program="' + index + '" data-delta="-1" aria-label="' + escape(label) + ' 한 명 줄이기" ' + (value <= min ? "disabled" : "") + '>−</button>' +
    '<input id="' + id + '" type="number" inputmode="numeric" min="' + min + '" max="' + max + '" step="1" data-control="' + field + '" data-program="' + index + '" aria-label="' + escape(label) + '" value="' + value + '"/>' +
    '<button type="button" data-action="step" data-control="' + field + '" data-program="' + index + '" data-delta="1" aria-label="' + escape(label) + ' 한 명 늘리기" ' + (value >= max ? "disabled" : "") + '>+</button></div>';
}

function conditionsView() {
  const capacity = totalCapacity(state.config);
  return '<section class="setup-card input-only" aria-labelledby="conditions-title">' +
    '<div class="flow-heading"><h2 id="conditions-title"><span class="flow-number">01</span>배정 조건</h2></div>' +
    '<div><div class="subject-heading"><span class="flow-label">배정할 과목</span><button class="text-button" data-action="' + (state.draft ? "cancel-programs" : "edit-programs") + '" aria-expanded="' + Boolean(state.draft) + '" aria-controls="program-editor">' + (state.draft ? "편집 닫기" : "과목 편집") + '</button></div><div class="subject-picks" role="group" aria-label="배정에 사용할 과목">' +
    state.programs.map((program, index) => '<button class="subject-pick" data-action="toggle-program" data-program="' + index + '" aria-pressed="' + program.enabled + '">' + (program.enabled ? icon("check") : "") + escape(program.name) + "</button>").join("") +
    '</div></div>' + programEditorView() +
    '<div class="capacity-heading"><span class="flow-label">배정할 인원</span><output class="capacity-total" aria-label="총 배정 인원" aria-live="polite" aria-atomic="true">총 <strong>' + capacity + '</strong>명</output></div><div class="capacity-grid">' +
    state.programs.flatMap((program, index) => program.enabled ? ['<div class="capacity-item"><label for="stepper-capacity-' + index + '">' + escape(program.name) + "</label>" + stepper({ value: program.capacity, label: program.name + " 정원", field: "capacity", index, max: MAX_VOLUNTEERS - capacity + program.capacity }) + "</div>"] : []).join("") +
    '</div></section>';
}

function preferenceCell(row, index, rank) {
  const field = "pref" + rank, selected = row[field];
  return '<td class="preference-input"><span class="preference-label">' + rank + "지망" + '</span><fieldset class="preference-options"><legend class="sr-only">' + (index + 1) + "번 " + rank + "지망</legend>" +
    state.config.subjects.map((subject, subjectIndex) => {
      const disabled = ["pref1","pref2","pref3"].some((other, otherIndex) => other !== field && otherIndex < modeCount() && row[other] === subject.name);
      return '<label class="preference-option"><input type="radio" name="preference-' + index + "-" + rank + '" data-index="' + index + '" data-field="' + field + '" value="' + escape(subject.name) + '" ' + (selected === subject.name ? "checked " : "") + (disabled ? "disabled " : "") + '/><span>' + escape(subject.name) + "</span></label>";
    }).join("") + "</fieldset></td>";
}

function inputView() {
  const completed = state.volunteers.filter((row) => row.name.trim() && row.pref1).length;
  return '<div class="allocation-flow"><section class="intro input-only"><h1 id="page-title">나눔교실 팀 배정</h1></section>' +
    conditionsView() +
    '<section class="input-section input-only" aria-labelledby="input-title"><div class="flow-heading"><h2 id="input-title"><span class="flow-number">02</span>명단 입력</h2><span class="small-muted" id="progress-text">' + completed + " / " + state.volunteers.length + '명 입력 완료</span></div>' +
    '<div class="import-zone" id="import-zone">' + icon("upload") + '<div class="import-description"><strong>엑셀에서 복사한 내용을 이름 칸에 바로 붙여넣으세요.</strong><p id="paste-instructions">이름 한 열 또는 이름·1지망·2지망' + (modeCount() === 3 ? "·3지망" : "") + ' 표를 복사한 뒤 ⌘V / Ctrl+V · CSV 파일을 여기에 놓아도 돼요.</p></div><div class="import-actions"><button class="button compact" data-action="import">파일 선택</button><button class="text-button" data-action="paste">붙여넣기 창</button><button class="text-button" data-action="template">입력 양식</button></div></div>' +
    preferenceModeView() + noticeMarkup() +
    '<div class="card roster-card"><div class="table-scroll roster-scroll" tabindex="0" role="region" aria-label="명단 입력 표. 이름 칸을 클릭하고 엑셀 내용을 붙여넣을 수 있습니다."><table class="input-table preference-table ' + (modeCount() === 3 ? "mode-three" : "") + '"><thead><tr><th class="number-col" scope="col">번호</th><th scope="col">이름 <span class="required">*</span></th>' +
    Array.from({length:modeCount()},(_,index) => '<th scope="col">' + (index + 1) + "지망" + "</th>").join("") +
    "</tr></thead><tbody>" + state.volunteers.map((row,index) => '<tr><th scope="row" class="row-number">' + String(index + 1).padStart(2,"0") + '</th><td class="name-input"><input autocomplete="off" type="text" maxlength="100" data-index="' + index + '" data-field="name" aria-label="' + (index + 1) + '번 이름" aria-describedby="paste-instructions" placeholder="이름" value="' + escape(row.name) + '"/></td>' +
      Array.from({length:modeCount()},(_,rank) => preferenceCell(row,index,rank + 1)).join("") + "</tr>").join("") +
    '</tbody></table></div><div class="card-bottom"><span class="small-muted">클릭한 이름 칸부터 아래로 입력돼요. 이름만 붙여넣으면 기존 지망은 유지돼요.</span></div></div>' +
    '<div class="action-bar"><div class="tool-buttons"><button class="button" data-action="save-input">' + icon("download") + '명단 저장</button><button class="text-button muted" data-action="clear">명단 비우기</button></div><button class="button primary" id="allocate-button" data-action="allocate">' + (state.result ? "다시 배정하기" : "배정하기") + icon("arrow") + '</button></div><p class="bottom-hint">' + icon("shield") + '자동 저장은 이 브라우저에서만 유지됩니다. 중요한 명단은 CSV로 저장해 주세요.</p></section>' +
    '<section class="inline-result" id="allocation-result" aria-labelledby="allocation-result-title">' + resultView() + "</section></div>";
}

function resultView() {
  const title = '<h2 id="allocation-result-title" tabindex="-1"><span class="flow-number">03</span>배정 결과</h2>';
  if (!state.result) return '<div class="flow-heading">' + title + '</div><p class="result-placeholder">배정을 마치면 이곳에서 바로 결과를 확인할 수 있어요.</p>';
  const result = state.result, ranks = state.resultConfig.preference_mode === "three" ? 3 : 2;
  const first = result.rows.filter((row) => row.rank === 1).length, within = result.rows.filter((row) => row.rank !== 99).length;
  return '<div class="flow-heading">' + title + '<div class="tool-buttons input-only"><button class="text-button" data-action="edit-input">입력 수정</button><button class="button compact" data-action="print" ' + (state.resultStale ? "disabled" : "") + '>인쇄 / PDF</button><button class="button compact" data-action="save-result" ' + (state.resultStale ? "disabled" : "") + ">" + icon("download") + "결과 CSV 저장</button></div></div>" +
    (state.resultStale ? '<p class="result-stale" role="status">입력이 바뀌었어요. 아래는 이전 결과입니다. 다시 배정해 주세요.</p>' : "") +
    '<p class="result-summary"><strong>' + result.rows.length + "명 배정 완료</strong> · 1지망 " + first + "명 · 지망 내 " + within + "명 · 미지망 " + (result.rows.length - within) + "명</p>" +
    '<section class="card"><div class="card-heading"><h3>과목별 팀 구성</h3><span class="badge ' + (state.resultStale ? "warning" : "success") + '">' + (state.resultStale ? "이전 결과" : "전체 정원 충족") + '</span></div><div class="team-grid">' +
    result.summary.map((team,index) => '<article class="team"><div class="team-heading"><span class="subject-mark mark-' + index % 5 + '">' + escape(team.subject.slice(0,1)) + "</span><h3>" + escape(team.subject) + "</h3><span>" + team.names.length + " / " + team.capacity + '명</span></div><div class="member-list">' + team.names.map((name) => '<span class="member">' + escape(name) + "</span>").join("") + "</div></article>").join("") +
    '</div></section><section class="card result-card"><div class="card-heading"><h3>나누미별 배정표</h3><span class="small-muted">총 비용 ' + result.cost + '점</span></div><div class="table-scroll result-scroll" tabindex="0" role="region" aria-label="나누미별 배정 결과"><table><thead><tr><th scope="col">번호</th><th scope="col">이름</th>' +
    Array.from({length:ranks},(_,index) => '<th scope="col">' + (index+1) + "지망</th>").join("") + '<th scope="col">배정 과목</th><th scope="col">배정 순위</th></tr></thead><tbody>' +
    result.rows.map((row) => '<tr><th scope="row" class="row-number">' + row.id + '</th><td class="name-cell">' + escape(row.name) + "</td>" + Array.from({length:ranks},(_,index) => '<td class="preference-cell">' + escape(row["pref"+(index+1)] || "—") + "</td>").join("") + '<td class="assigned-cell">' + escape(row.assigned) + '</td><td><span class="badge ' + (row.rank === 1 ? "success" : row.rank === 99 ? "warning" : "neutral") + '">' + row.match_label + "</span></td></tr>").join("") +
    '</tbody></table></div></section><p class="bottom-hint">1지망 0점 · 2지망 1점' + (ranks === 3 ? " · 3지망 2점" : "") + " · 미지망 10점으로 계산합니다. 미지망 배정도 발생할 수 있습니다.</p>";
}

function programEditorView() {
  if (!state.draft) return '<div id="program-editor" hidden></div>';
  return '<section class="program-editor" id="program-editor" aria-labelledby="program-editor-title"><h3 id="program-editor-title">과목 편집</h3><p class="flow-help">이름을 바꿔도 기존 지망 선택은 같은 과목으로 이어져요.</p><p id="program-error" class="editor-error" role="alert" tabindex="-1"></p><div class="settings-table"><table><thead><tr><th scope="col">과목 이름</th><th scope="col"><span class="sr-only">삭제</span></th></tr></thead><tbody>' +
    state.draft.programs.map((program,index) => '<tr><td><input data-program="' + index + '" data-setting="name" type="text" maxlength="40" aria-label="' + (index+1) + '번째 과목 이름" placeholder="과목 이름" value="' + escape(program.name) + '"/></td><td><button class="icon-button" data-action="remove-program" data-program="' + index + '" aria-label="' + (index+1) + '번째 과목 삭제" ' + (state.draft.programs.length === 1 ? "disabled" : "") + ">" + icon("trash") + "</button></td></tr>").join("") +
    '</tbody></table></div><div class="program-editor-actions"><button class="text-button" data-action="add-program">' + icon("plus") + '과목 추가</button><div class="tool-buttons"><button class="button compact" data-action="cancel-programs">취소</button><button class="button primary compact" data-action="save-programs">편집 완료</button></div></div></section>';
}

function preferenceModeView() {
  return '<div class="preference-mode-row"><span id="preference-mode-label" class="flow-label">받을 지망 수</span><fieldset class="preference-mode-picker" aria-labelledby="preference-mode-label"><legend class="sr-only">받을 지망 수</legend>' +
    [["two","1~2지망"],["three","1~3지망"]].map(([mode,label]) => '<label><input type="radio" name="preference-mode" value="' + mode + '" ' + (state.config.preference_mode === mode ? "checked" : "") + '/><span>' + label + "</span></label>").join("") +
    '</fieldset></div>';
}

function aboutView() {
  const emailUrl = "mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent("[나눔교실 팀 배정] 오류 제보 및 건의");
  return '<article class="about-view"><header class="intro"><h1 id="page-title">서비스 소개</h1><p>나눔교실 봉사자의 지망을 바탕으로, 과목별 정원에 맞춰 팀을 배정하는 도구입니다.</p></header>' + noticeMarkup() +
    '<section class="about-section" aria-labelledby="about-allocation-title"><h2 id="about-allocation-title">배정 기준</h2><p>과목별 정원만큼 자리를 만들고, 한 사람에게 한 자리씩 배정합니다. 헝가리안 알고리즘으로 전체 배정 비용의 합이 가장 작은 조합을 찾습니다.</p>' +
    '<div class="about-costs"><div><span>1지망</span><strong>0점</strong></div><div><span>2지망</span><strong>1점</strong></div><div><span>3지망</span><strong>2점</strong></div><div><span>미지망</span><strong>10점</strong></div></div>' +
    '<p class="small-muted">3지망은 받을 지망 수를 1~3지망으로 정했을 때만 반영합니다.</p><ul><li>특정 과목에 지망이 몰리면 미지망 배정이 발생할 수 있습니다.</li><li>1지망 인원 최대화나 미지망 인원 최소화를 각각 별도로 보장하지는 않습니다.</li><li>최적 조합이 여러 개라면 입력 순서와 과목 순서에 따라 그중 하나를 선택합니다.</li><li>현재 전공과 경력은 배정 계산에 반영하지 않습니다.</li></ul><p>최대 ' + MAX_VOLUNTEERS + '명을 지원하며, 사용할 과목마다 최소 한 명의 정원이 필요합니다.</p></section>' +
    '<section class="about-section" aria-labelledby="about-data-title"><h2 id="about-data-title">명단 보관</h2><p>명단과 배정 계산은 브라우저에서 처리하며, 명단을 서버로 전송하지 않습니다. 설정과 입력은 해당 브라우저에 자동 저장됩니다.</p><p>브라우저 데이터를 삭제하거나 다른 브라우저를 사용하면 유지되지 않으므로, 중요한 명단은 CSV로 보관해 주세요.</p></section>' +
    '<section class="about-section" aria-labelledby="about-use-title"><h2 id="about-use-title">이용 안내</h2><p>비상업적인 목적으로 무료 사용·수정·재배포할 수 있습니다. 상업적 이용은 사전 허가가 필요합니다. 자세한 조건은 <a href="./LICENSE.txt" target="_blank" rel="noopener">이용 허가서</a>를 확인해 주세요.</p><div class="about-links"><a href="https://github.com/largeq/nanoome-teams" target="_blank" rel="noopener noreferrer">소스 코드</a></div></section>' +
    '<section class="about-section" aria-labelledby="about-feedback-title"><h2 id="about-feedback-title">오류 제보 및 건의</h2><p>오류 제보, 개선 건의, 사용 후기는 GitHub 또는 이메일로 보내 주세요.</p><div class="about-links"><a href="https://github.com/largeq/nanoome-teams/issues" target="_blank" rel="noopener noreferrer">GitHub에 남기기</a><a href="' + escape(emailUrl) + '">이메일: ' + escape(SUPPORT_EMAIL) + '</a></div></section></article>';
}

function dialogs() {
  return '<input id="csv-file" class="hidden" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"/>' +
    '<dialog id="paste-dialog" aria-labelledby="paste-title"><div class="dialog-top"><h2 id="paste-title">명단 붙여넣기</h2><button class="icon-button" data-action="close-dialog" aria-label="붙여넣기 닫기">×</button></div><div class="dialog-content"><p id="paste-description">이름만 또는 이름·1지망·2지망' + (modeCount() === 3 ? "·3지망" : "") + ' 표를 붙여넣으세요. 제목 행도 함께 넣을 수 있습니다.</p><textarea id="paste-text" aria-label="붙여넣을 명단" aria-describedby="paste-description" rows="9" placeholder="엑셀에서 복사한 내용을 붙여넣으세요."></textarea><p class="small-muted">첫 번째 행부터 입력합니다. 이름 칸에 바로 붙여넣으면 선택한 행부터 입력할 수 있어요.</p><p id="paste-error" class="paste-error" role="alert"></p></div><div class="dialog-actions"><button class="button" data-action="close-dialog">취소</button><button class="button primary" data-action="apply-paste">명단에 적용</button></div></dialog>';
}

function render() {
  root.innerHTML = '<div class="app-shell">' + sidebar() + '<main id="main" tabindex="-1"><div class="workspace">' + (state.tab === "input" ? inputView() : aboutView()) + '<footer class="page-footer"><span class="creator-credit"><strong>제작</strong> 프로네시스 나눔실천단 38기 재무부장 정근규</span><nav class="footer-links" aria-label="이용 조건 및 의견"><a href="./LICENSE.txt" target="_blank" rel="noopener">비상업적 이용 조건</a><a href="https://github.com/largeq/nanoome-teams/issues" target="_blank" rel="noopener noreferrer">후기·의견</a></nav></footer></div></main></div>' + dialogs();
  renderNotice();
}

function refreshResult() {
  const section = document.querySelector("#allocation-result");
  if (section) section.innerHTML = resultView();
}

function hasProgramEdits() {
  const names = (programs) => programs.map(({ key, name }) => ({ key, name }));
  return state.draft && JSON.stringify(names(state.draft.programs)) !== JSON.stringify(names(state.programs));
}
function switchTab(tab) {
  if (!["input","about"].includes(tab) || tab === state.tab) return;
  if (hasProgramEdits() && !confirm("아직 적용하지 않은 과목 편집 내용이 있습니다. 변경 내용을 버리고 이동할까요?")) return;
  state.tab = tab; state.notice = null; state.draft = null;
  render(); document.querySelector("#main").focus({ preventScroll: true }); window.scrollTo({ top: 0 });
}

function download(filename, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function inputCsvRows(volunteers = state.volunteers) {
  return [["이름","1지망","2지망",...(modeCount() === 3 ? ["3지망"] : [])], ...volunteers.map((row) => [row.name,row.pref1,row.pref2,...(modeCount() === 3 ? [row.pref3] : [])])];
}

function commitLayout(message) {
  changed(); save(); render(); notify(message,"info");
}

function changeCapacity(index, value) {
  const program = state.programs[index], count = Number(value);
  if (!program?.enabled || !Number.isInteger(count) || count < 1 || count > MAX_VOLUNTEERS ||
    totalCapacity(state.config) - program.capacity + count > MAX_VOLUNTEERS) {
    render(); throw new InputError(["정원은 1명 이상, 전체 정원 합계는 " + MAX_VOLUNTEERS + "명 이하로 입력해 주세요."]);
  }
  if (program.capacity === count) return;
  const capacity = totalCapacity(state.config) - program.capacity + count;
  const warning = removedRowsMessage(capacity);
  if (warning && !confirm(warning + "\n정원을 변경할까요?")) { render(); return; }
  program.capacity = count; syncConfig();
  state.volunteers = resizeVolunteers(capacity);
  changed(); save(); render();
}

function toggleProgram(index) {
  const program = state.programs[index];
  if (!program) return;
  if (program.enabled && enabledPrograms().length === 1) throw new InputError(["배정할 과목은 하나 이상 선택해 주세요."]);
  const capacity = totalCapacity(state.config) + (program.enabled ? -program.capacity : program.capacity);
  if (capacity > MAX_VOLUNTEERS) throw new InputError(["이 과목을 포함하면 총 " + capacity + "명입니다. 다른 과목의 정원을 줄여 합계를 " + MAX_VOLUNTEERS + "명 이하로 맞춰 주세요."]);
  const affected = program.enabled ? state.volunteers.filter((row) => ["pref1","pref2","pref3"].some((field) => row[field] === program.name)).length : 0;
  const messages = [removedRowsMessage(capacity), affected ? "이 과목을 선택한 " + affected + "명의 지망 선택이 해제됩니다." : ""].filter(Boolean);
  if (messages.length && !confirm(messages.join("\n") + "\n배정 과목을 바꿀까요?")) return;
  program.enabled = !program.enabled;
  state.volunteers = resizeVolunteers(capacity);
  if (!program.enabled) state.volunteers.forEach((row) => ["pref1","pref2","pref3"].forEach((field) => { if (row[field] === program.name) row[field] = ""; }));
  syncConfig(); commitLayout("배정 과목을 변경했습니다. 총 " + capacity + "명입니다.");
}

function applyImport(text, startIndex = 0) {
  const scroll = document.querySelector(".roster-scroll")?.scrollTop ?? 0;
  const plan = planClipboardPaste(text, state.volunteers, state.config, startIndex);
  if (plan.count > totalCapacity(state.config)) throw new InputError(["이 위치부터 붙여넣으려면 총 " + plan.count + "명의 정원이 필요합니다. 위의 과목별 정원을 늘린 뒤 다시 붙여넣어 주세요."]);
  if (plan.overwrittenCells && !confirm("기존 " + plan.overwrittenCells + "개 칸의 내용이 바뀝니다.\n이 명단을 입력할까요?")) return false;
  state.volunteers = plan.volunteers;
  changed(); save(); render();
  const table = document.querySelector(".roster-scroll");
  if (table) table.scrollTop = scroll;
  document.querySelector('[data-index="' + startIndex + '"][data-field="name"]')?.focus({ preventScroll: true });
  notify((startIndex + 1) + "번부터 " + plan.rowCount + "행을 입력했습니다. 이름과 1지망이 비어 있는 행은 이어서 입력해 주세요.","info");
  return true;
}

async function importFile(file) {
  if (!file) return;
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new InputError(["CSV 파일을 놓아 주세요. 엑셀 파일은 열어서 셀을 복사한 뒤 이름 칸에 바로 붙여넣을 수 있습니다."]);
  if (file.size > 2 * 1024 * 1024) throw new InputError(["2MB 이하의 CSV 파일을 사용해 주세요."]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.includes(0)) throw new InputError(["CSV UTF-8 형식으로 저장해 주세요. 엑셀 표는 이름 칸에 바로 붙여넣을 수도 있습니다."]);
  let text;
  try { text = new TextDecoder("utf-8",{fatal:true}).decode(bytes); }
  catch { throw new InputError(["한글이 깨지지 않도록 CSV UTF-8 형식으로 저장해 주세요."]); }
  applyImport(text);
}

function savePrograms() {
  if (!hasProgramEdits()) {
    state.draft = null; render();
    document.querySelector('[data-action="edit-programs"]')?.focus({preventScroll:true});
    return;
  }
  const programs = state.draft.programs.map((program) => ({
    ...(state.programs.find((current) => current.key === program.key) ?? program),
    name: program.name.trim(),
  }));
  if (programs.some((program) => !program.name || program.name.length > 40) || new Set(programs.map((program) => program.name)).size !== programs.length) {
    throw new InputError(["과목 이름을 1~40자로 입력하고, 서로 중복되지 않게 정해 주세요."]);
  }
  const selected = programs.filter((program) => program.enabled);
  if (!selected.length) throw new InputError(["배정할 과목 하나는 남겨 주세요."]);
  const config = normalizeConfig({ preference_mode:state.config.preference_mode, subjects:selected.map(({name,capacity}) => ({name,capacity})) });
  const capacity = totalCapacity(config);
  const byKey = new Map(programs.map((program) => [program.key,program.name]));
  const renamed = new Map(state.programs.map((program) => [program.name,byKey.get(program.key)]));
  const allowed = new Set(selected.map((program) => program.name));
  const next = state.volunteers.map((row) => {
    const mapped = { ...row };
    for (const field of ["pref1","pref2","pref3"]) mapped[field] = renamed.get(mapped[field]) ?? "";
    for (const field of ["pref1","pref2","pref3"]) if (mapped[field] && !allowed.has(mapped[field])) mapped[field] = "";
    if (state.config.preference_mode === "two") mapped.pref3 = "";
    return mapped;
  });
  const removedChoices = state.volunteers.slice(0,capacity).reduce((sum,row,index) => sum + ["pref1","pref2","pref3"].filter((field) => row[field] && !next[index][field]).length,0);
  const messages = [removedRowsMessage(capacity), removedChoices ? "과목 삭제로 " + removedChoices + "개의 지망 선택이 해제됩니다." : ""].filter(Boolean);
  if (messages.length && !confirm(messages.join("\n") + "\n과목 편집 내용을 적용할까요?")) return;
  state.config = config; state.programs = programs; state.volunteers = resizeVolunteers(capacity,next);
  changed(); state.draft = null; save(); render();
  document.querySelector('[data-action="edit-programs"]')?.focus({preventScroll:true});
  notify("과목 편집을 적용했습니다. 이름을 바꾼 과목의 지망 선택도 이어집니다.","info");
}

function changePreferenceMode(mode) {
  if (!["two","three"].includes(mode) || mode === state.config.preference_mode) return;
  const scroll = document.querySelector(".roster-scroll")?.scrollTop ?? 0;
  const thirdChoices = state.volunteers.filter((row) => row.pref3).length;
  if (mode === "two" && thirdChoices && !confirm("입력한 3지망 " + thirdChoices + "개가 삭제됩니다. 이름과 1·2지망은 유지됩니다.\n1~2지망으로 바꿀까요?")) {
    document.querySelector('input[name="preference-mode"][value="' + state.config.preference_mode + '"]').checked = true;
    return;
  }
  state.config.preference_mode = mode;
  if (mode === "two") state.volunteers.forEach((row) => { row.pref3 = ""; });
  changed(); save(); render();
  const table = document.querySelector(".roster-scroll");
  if (table) table.scrollTop = scroll;
  document.querySelector('input[name="preference-mode"][value="' + mode + '"]')?.focus({preventScroll:true});
}

const actions = {
  paste: () => { document.querySelector("#paste-error").textContent = ""; document.querySelector("#paste-dialog").showModal(); },
  "close-dialog": (button) => button.closest("dialog").close(),
  dismiss: () => { state.notice = null; renderNotice(); },
  import: () => document.querySelector("#csv-file").click(),
  template: () => download("나눔교실_명단_입력양식.csv",inputCsvRows(emptyVolunteers(state.volunteers.length))),
  "save-input": () => { save(); download("나눔교실_명단.csv",inputCsvRows()); },
  "save-result": () => {
    if (!state.result || state.resultStale) return;
    const ranks = state.resultConfig.preference_mode === "three" ? 3 : 2;
    download("나눔교실_배정결과.csv",[["번호","이름","1지망","2지망",...(ranks === 3 ? ["3지망"] : []),"배정 과목","배정 순위"],...state.result.rows.map((row) => [row.id,row.name,row.pref1,row.pref2,...(ranks === 3 ? [row.pref3] : []),row.assigned,row.match_label])]);
  },
  print: () => { if (state.result && !state.resultStale) window.print(); },
  clear: () => {
    if (hasInput() && !confirm("현재 명단을 모두 비울까요? 과목과 정원은 유지됩니다.")) return;
    state.volunteers = emptyVolunteers(state.volunteers.length); clearResult(); save(); state.notice = null; render();
  },
  "edit-input": () => { document.querySelector('[data-index="0"][data-field="name"]')?.focus(); },
  allocate: () => {
    state.result = allocate(state.config,state.volunteers); state.resultConfig = clone(state.config); state.resultStale = false;
    save(); state.notice = null; renderNotice(); refreshResult();
    document.querySelector("#allocate-button").innerHTML = "다시 배정하기" + icon("arrow");
    const result = document.querySelector("#allocation-result");
    result.classList.remove("result-reveal"); void result.offsetWidth; result.classList.add("result-reveal");
    document.querySelector("#allocation-result-title").focus({preventScroll:true});
    result.scrollIntoView({block:"start",behavior:reducedMotion() ? "instant" : "smooth"});
  },
  "apply-paste": () => {
    try { applyImport(document.querySelector("#paste-text").value); }
    catch(error) { document.querySelector("#paste-error").textContent = (error instanceof InputError ? error.messages : ["붙여넣을 내용을 확인해 주세요."]).join("\n"); }
  },
  step: (button) => {
    const index = Number(button.dataset.program), delta = Number(button.dataset.delta);
    changeCapacity(index,state.programs[index].capacity + delta);
  },
  "toggle-program": (button) => toggleProgram(Number(button.dataset.program)),
  "edit-programs": () => {
    state.draft = {programs:clone(state.programs)};
    render(); document.querySelector('[data-setting="name"]')?.focus({preventScroll:true});
  },
  "cancel-programs": () => {
    state.draft = null; render();
    document.querySelector('[data-action="edit-programs"]')?.focus({preventScroll:true});
  },
  "add-program": () => {
    if (state.draft.programs.length >= MAX_VOLUNTEERS) throw new InputError(["과목은 최대 " + MAX_VOLUNTEERS + "개까지 만들 수 있습니다."]);
    state.draft.programs.push({key:crypto.randomUUID(),name:"",capacity:1,enabled:false});
    render(); document.querySelector('[data-program="' + (state.draft.programs.length - 1) + '"][data-setting="name"]').focus();
  },
  "remove-program": (button) => {
    const index = Number(button.dataset.program), program = state.draft.programs[index];
    if (state.programs.some((current) => current.key === program.key && current.enabled) &&
      !state.draft.programs.some((item) => item.key !== program.key && state.programs.some((current) => current.key === item.key && current.enabled))) throw new InputError(["배정할 과목 하나는 남겨 주세요."]);
    if (state.draft.programs.length > 1) state.draft.programs.splice(index,1);
    render();
  },
  "save-programs": savePrograms,
};

root.addEventListener("click",(event) => {
  const element = event.target;
  // Native radios are already checked when click fires; compare the saved choice.
  if (element.matches('input[type="radio"][data-field]') && !element.disabled &&
    state.volunteers[Number(element.dataset.index)][element.dataset.field] === element.value) {
    element.checked = false;
    updateVolunteer(element);
    return;
  }
  const button = event.target.closest("[data-action], [data-tab]");
  if (!button || button.disabled) return;
  try {
    if (button.dataset.tab) switchTab(button.dataset.tab);
    else actions[button.dataset.action]?.(button);
  } catch(error) {
    const messages = error instanceof InputError ? error.messages : ["처리 중 문제가 발생했습니다. 입력 내용을 확인하고 다시 시도해 주세요."];
    const editorError = document.querySelector("#program-error");
    if (editorError && ["add-program","remove-program","save-programs"].includes(button.dataset.action)) {
      editorError.textContent = messages.join("\n"); editorError.focus();
    } else notify(messages);
  }
});

function updateProgress() {
  const completed = state.volunteers.filter((row) => row.name.trim() && row.pref1).length;
  const progress = document.querySelector("#progress-text");
  if (progress) progress.textContent = completed + " / " + state.volunteers.length + "명 입력 완료";
}
function updatePreferenceControls(index) {
  const row = state.volunteers[index];
  root.querySelectorAll('input[type="radio"][data-index="' + index + '"]').forEach((radio) => {
    radio.checked = row[radio.dataset.field] === radio.value;
    radio.disabled = ["pref1","pref2","pref3"].some((field,rank) => rank < modeCount() && field !== radio.dataset.field && row[field] === radio.value);
  });
}
function updateVolunteer(element) {
  const index = Number(element.dataset.index);
  state.volunteers[index][element.dataset.field] = element.type === "radio" && !element.checked ? "" : element.value;
  changed(); scheduleSave(); updateProgress();
  if (element.type === "radio") updatePreferenceControls(index);
}
root.addEventListener("input",(event) => {
  const element = event.target;
  if (element.dataset.field && element.type === "text") updateVolunteer(element);
  if (element.dataset.setting === "name") state.draft.programs[Number(element.dataset.program)].name = element.value;
});
root.addEventListener("change",async (event) => {
  const element = event.target;
  try {
    if (element.dataset.field && element.type === "radio" && element.checked) updateVolunteer(element);
    if (element.dataset.control === "capacity" && element.tagName === "INPUT") changeCapacity(Number(element.dataset.program),element.value);
    if (element.name === "preference-mode") changePreferenceMode(element.value);
    if (element.id === "csv-file") {
      try { await importFile(element.files[0]); } finally { element.value = ""; }
    }
  } catch(error) { notify(error instanceof InputError ? error.messages : "파일이나 입력 내용을 확인해 주세요."); }
});
root.addEventListener("paste",(event) => {
  const element = event.target;
  if (state.tab !== "input" || element.dataset.field !== "name") return;
  const text = event.clipboardData?.getData("text/plain");
  // Keep ordinary text editing intact when a single name is pasted.
  if (!text || !/[\r\n\t]/.test(text)) return;
  event.preventDefault();
  try { applyImport(text,Number(element.dataset.index)); }
  catch(error) { notify(error instanceof InputError ? error.messages : "엑셀에서 복사한 이름 또는 표를 확인해 주세요."); }
});
root.addEventListener("keydown",(event) => {
  const element = event.target;
  if (event.key === " " && element.matches('input[type="radio"][data-field]')) {
    event.preventDefault();
    if (element.disabled || event.repeat) return;
    element.checked = state.volunteers[Number(element.dataset.index)][element.dataset.field] !== element.value;
    updateVolunteer(element);
    return;
  }
  if (event.target.dataset.field !== "name" || event.altKey || event.ctrlKey || event.metaKey || !["ArrowUp","ArrowDown","Enter"].includes(event.key)) return;
  const index = Number(event.target.dataset.index) + (event.key === "ArrowUp" ? -1 : 1);
  const input = root.querySelector('[data-index="' + index + '"][data-field="name"]');
  if (input) { event.preventDefault(); input.focus(); }
});
const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
function resetDrag() { dragDepth = 0; document.querySelector("#import-zone")?.classList.remove("is-dragging"); }
root.addEventListener("dragenter",(event) => {
  if (state.tab !== "input" || !hasFiles(event)) return;
  event.preventDefault(); dragDepth++; document.querySelector("#import-zone")?.classList.add("is-dragging");
});
root.addEventListener("dragover",(event) => {
  if (state.tab !== "input" || !hasFiles(event)) return;
  event.preventDefault(); event.dataTransfer.dropEffect = "copy";
});
root.addEventListener("dragleave",(event) => {
  if (!hasFiles(event)) return;
  dragDepth--; if (dragDepth <= 0) resetDrag();
});
root.addEventListener("drop",async (event) => {
  if (state.tab !== "input" || !hasFiles(event)) return;
  event.preventDefault(); resetDrag();
  try {
    if (event.dataTransfer.files.length !== 1) throw new InputError(["CSV 파일 한 개씩 불러와 주세요."]);
    await importFile(event.dataTransfer.files[0]);
  } catch(error) { notify(error instanceof InputError ? error.messages : "파일을 읽지 못했습니다."); }
});


window.addEventListener("pagehide", save);
restore();
render();
