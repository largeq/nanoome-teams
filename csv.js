import { InputError, normalizeVolunteer } from "./allocation.js";

const MAX_TEXT_SIZE = 2 * 1024 * 1024;

function guessDelimiter(text) {
  const counts = { ",": 0, "\t": 0, ";": 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\n" || char === "\r") break;
      if (char in counts) counts[char]++;
    }
  }
  return Object.keys(counts).reduce((best, delimiter) => counts[delimiter] > counts[best] ? delimiter : best, ",");
}

export function parseCsv(raw, { keepEmptyRows = false } = {}) {
  if (typeof raw !== "string" || raw.length > MAX_TEXT_SIZE) throw new InputError(["파일은 2MB 이하의 CSV 또는 탭으로 구분된 텍스트를 사용해 주세요."]);
  const text = raw.replace(/^\uFEFF/, "");
  const delimiter = guessDelimiter(text);
  const rows = [];
  let row = [], cell = "", quoted = false, closed = false;
  const pushRow = () => {
    row.push(cell);
    if (keepEmptyRows || row.some((value) => value.trim())) rows.push(row);
    row = []; cell = ""; closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === delimiter) {
      row.push(cell); cell = ""; closed = false;
    } else if (char === "\n" || char === "\r") {
      pushRow();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (char === '"') {
      if (cell.length || closed) throw new InputError(["CSV의 따옴표 형식을 확인해 주세요."]);
      quoted = true;
    } else if (closed) {
      if (!/\s/.test(char)) throw new InputError(["CSV에서 닫는 따옴표 뒤의 값을 확인해 주세요."]);
    } else cell += char;
  }
  if (quoted) throw new InputError(["CSV에 닫히지 않은 따옴표가 있습니다."]);
  if (row.length || cell.length || closed) pushRow();
  return rows;
}

export function importVolunteers(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new InputError(["불러올 명단이 없습니다. 이름과 지망을 입력해 주세요."]);
  const key = (value) => value.trim().toLowerCase().replace(/[\s_·]/g, "");
  const aliases = [
    ["이름", "성명", "name"],
    ["1지망", "공부법1지망", "pref1"],
    ["2지망", "공부법2지망", "pref2"],
    ["3지망", "공부법3지망", "pref3"],
  ];
  const first = rows[0].map(key);
  let columns = [0, 1, 2, 3], data = rows;
  if (aliases[0].some((alias) => first.includes(alias))) {
    columns = aliases.map((list) => first.findIndex((header) => list.includes(header)));
    if (columns[1] < 0) throw new InputError(["CSV 첫 줄에 '이름'과 '1지망' 열이 필요합니다."]);
    data = rows.slice(1);
  } else if (rows.some((row) => row.length < 2 || row.length > 4)) {
    throw new InputError(["제목 줄이 없는 명단은 이름, 1지망, 2지망, 3지망 순서로 2~4개 열을 사용해 주세요."]);
  }
  if (!data.length) throw new InputError(["제목 줄 아래에 명단을 입력해 주세요."]);
  return data.map((row) => normalizeVolunteer({ name: row[columns[0]], pref1: row[columns[1]], pref2: row[columns[2]], pref3: row[columns[3]] }));
}

export function toCsv(rows) {
  const cell = (value) => {
    let text = String(value ?? "");
    // Avoid executing user-entered text as formulas in spreadsheet applications.
    if (typeof value === "string" && (/^[\u0000-\u0020]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
