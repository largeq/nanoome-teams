import { InputError, MAX_VOLUNTEERS, normalizeVolunteer } from "./allocation.js";
import { parseCsv } from "./csv.js";

const fields = ["name", "pref1", "pref2", "pref3"];
const aliases = [
  ["이름", "성명", "name"],
  ["1지망", "공부법1지망", "pref1"],
  ["2지망", "공부법2지망", "pref2"],
  ["3지망", "공부법3지망", "pref3"],
];
const headerKey = (value) => value.trim().toLowerCase().replace(/[\s_·]/g, "");

// Retain the copied rectangle, including blank rows and explicitly empty cells.
// A names-only paste changes names without clearing existing preferences.
export function readClipboardTable(text) {
  const rows = parseCsv(text, { keepEmptyRows: true });
  if (!rows.some((row) => row.some((value) => value.trim()))) {
    throw new InputError(["붙여넣을 내용이 없습니다. 엑셀에서 이름이나 명단 표를 복사해 주세요."]);
  }
  const first = rows[0].map(headerKey);
  const hasHeader = aliases[0].some((alias) => first.includes(alias));
  let columns;
  if (hasHeader) {
    columns = aliases.map((names, index) => {
      const matches = first.flatMap((value, column) => names.includes(value) ? [column] : []);
      if (matches.length > 1) throw new InputError(["제목 행의 " + (index ? index + "지망" : "이름") + " 열이 중복됩니다."]);
      return matches[0] ?? -1;
    });
    rows.shift();
  } else {
    const width = Math.max(...rows.map((row) => row.length));
    if (width > 4) throw new InputError(["이름, 1지망, 2지망, 3지망 순서로 최대 4개 열을 복사해 주세요."]);
    columns = fields.map((_, index) => index < width ? index : -1);
  }
  if (!rows.length) throw new InputError(["제목 행 아래의 이름도 함께 복사해 주세요."]);
  if (rows.length > MAX_VOLUNTEERS) throw new InputError(["명단은 최대 " + MAX_VOLUNTEERS + "명까지 입력할 수 있습니다."]);
  const includedFields = fields.filter((_, index) => columns[index] >= 0);
  return {
    includedFields,
    rows: rows.map((cells) => {
      const normalized = normalizeVolunteer(Object.fromEntries(fields.map((field, index) => [field, cells[columns[index]] ?? ""])));
      return Object.fromEntries(includedFields.map((field) => [field, normalized[field]]));
    }),
  };
}

// Prepare an atomic change. The caller confirms overwrites and capacity changes
// before applying this plan; validation never modifies the current roster.
export function planClipboardPaste(text, volunteers, config, startIndex = 0) {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= volunteers.length) {
    throw new InputError(["붙여넣기를 시작할 이름 칸을 선택해 주세요."]);
  }
  const table = readClipboardTable(text);
  const count = Math.max(volunteers.length, startIndex + table.rows.length);
  if (count > MAX_VOLUNTEERS) {
    throw new InputError(["이 위치부터 붙여넣으면 " + count + "명이 됩니다. 최대 " + MAX_VOLUNTEERS + "명까지 입력할 수 있습니다."]);
  }
  const next = Array.from({ length: count }, (_, index) => normalizeVolunteer(volunteers[index] ?? {}));
  const allowed = new Set(config.subjects.map((subject) => subject.name));
  const preferenceFields = config.preference_mode === "three" ? ["pref1", "pref2", "pref3"] : ["pref1", "pref2"];
  let overwrittenCells = 0;
  const errors = [];
  table.rows.forEach((values, offset) => {
    const index = startIndex + offset;
    const previous = next[index];
    for (const field of table.includedFields) {
      if (previous[field] && previous[field] !== values[field]) overwrittenCells++;
    }
    const row = { ...previous, ...values };
    if (row.name.length > 100) errors.push((index + 1) + "번: 이름은 100자 이내로 입력해 주세요.");
    if (config.preference_mode === "two" && values.pref3) {
      errors.push((index + 1) + "번: 3지망이 포함되어 있습니다. 명단 입력의 ‘받을 지망 수’를 1~3지망으로 바꾸거나 3지망 열을 제외해 주세요.");
    }
    for (const field of preferenceFields) {
      if (row[field] && !allowed.has(row[field])) {
        errors.push((index + 1) + "번 " + field.replace("pref", "") + "지망: ‘" + row[field] + "’은 선택한 과목에 없습니다. 배정 과목이나 원본 표의 과목 이름을 확인해 주세요.");
      }
    }
    const preferences = preferenceFields.map((field) => row[field]).filter(Boolean);
    if (new Set(preferences).size !== preferences.length) errors.push((index + 1) + "번: 지망에는 서로 다른 과목을 선택해 주세요.");
    next[index] = row;
  });
  if (errors.length) throw new InputError(errors);
  return { volunteers: next, count, rowCount: table.rows.length, startIndex, overwrittenCells };
}
