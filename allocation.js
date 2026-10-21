export const MAX_VOLUNTEERS = 30;

export const defaultConfig = () => ({
  subjects: ["국어", "수학", "영어", "사탐", "과탐"].map((name) => ({ name, capacity: 4 })),
  preference_mode: "two",
});

export const totalCapacity = (config) => config.subjects.reduce((sum, subject) => sum + subject.capacity, 0);
export const emptyVolunteer = () => ({ name: "", pref1: "", pref2: "", pref3: "" });
export const emptyVolunteers = (count) => Array.from({ length: count }, emptyVolunteer);

export function cleanPreference(value) {
  const text = String(value ?? "").trim();
  return /^(nan|none|nat)$/i.test(text) ? "" : text;
}

export class InputError extends Error {
  constructor(messages) {
    super(messages.join("\n"));
    this.name = "InputError";
    this.messages = messages;
  }
}

export function validateConfig(config) {
  const errors = [];
  if (!config || !Array.isArray(config.subjects) || config.subjects.length === 0) {
    return ["프로그램을 1개 이상 입력해 주세요."];
  }
  if (!["two", "three"].includes(config.preference_mode)) errors.push("지망 수를 2개 또는 3개로 설정해 주세요.");
  const seen = new Set();
  for (const [index, subject] of config.subjects.entries()) {
    const name = typeof subject?.name === "string" ? subject.name.trim() : "";
    if (!name) errors.push(`${index + 1}번째 프로그램의 이름을 입력해 주세요.`);
    else if (seen.has(name)) errors.push(`프로그램 이름이 중복됩니다: ${name}`);
    seen.add(name);
    if (!Number.isInteger(subject?.capacity) || subject.capacity < 1 || subject.capacity > MAX_VOLUNTEERS) {
      errors.push(`${name || `${index + 1}번째 프로그램`}: 정원은 1~${MAX_VOLUNTEERS} 사이의 정수여야 합니다.`);
    }
  }
  if (errors.length === 0 && totalCapacity(config) > MAX_VOLUNTEERS) errors.push(`전체 정원은 최대 ${MAX_VOLUNTEERS}명입니다.`);
  return errors;
}

export function normalizeConfig(config) {
  const errors = validateConfig(config);
  if (errors.length) throw new InputError(errors);
  return {
    preference_mode: config.preference_mode,
    subjects: config.subjects.map((subject) => ({ name: subject.name.trim(), capacity: subject.capacity })),
  };
}

export function normalizeVolunteer(volunteer) {
  return {
    name: String(volunteer?.name ?? "").trim(),
    pref1: cleanPreference(volunteer?.pref1),
    pref2: cleanPreference(volunteer?.pref2),
    pref3: cleanPreference(volunteer?.pref3),
  };
}

export function preferences(volunteer, config) {
  return [volunteer.pref1, volunteer.pref2, ...(config.preference_mode === "three" ? [volunteer.pref3] : [])].map(cleanPreference);
}

export function validateVolunteers(config, volunteers) {
  const errors = validateConfig(config);
  if (errors.length) return errors;
  if (!Array.isArray(volunteers)) return ["명단을 확인해 주세요."];
  if (volunteers.length !== totalCapacity(config)) errors.push(`전체 정원 ${totalCapacity(config)}명과 명단 ${volunteers.length}명의 인원이 일치해야 합니다.`);
  const allowed = new Set(config.subjects.map((subject) => subject.name.trim()));
  for (const [index, volunteer] of volunteers.entries()) {
    const row = normalizeVolunteer(volunteer);
    const label = `${index + 1}번${row.name ? ` ${row.name}` : ""}`;
    if (!row.name) errors.push(`${label}: 이름을 입력해 주세요.`);
    const prefs = preferences(row, config);
    if (!prefs[0]) errors.push(`${label}: 1지망은 필수입니다.`);
    const filled = prefs.filter(Boolean);
    if (filled.some((pref) => !allowed.has(pref))) errors.push(`${label}: 설정에 없는 프로그램이 지망에 포함되어 있습니다.`);
    if (new Set(filled).size !== filled.length) errors.push(`${label}: 서로 다른 프로그램을 선택해 주세요.`);
  }
  return errors;
}

export const preferenceCost = (rank) => ({ 1: 0, 2: 1, 3: 2 })[rank] ?? 10;

// Hungarian algorithm: minimize the sum of a square cost matrix in O(n^3).
// Rows are volunteers; repeated program columns represent individual seats.
export function solveAssignment(cost) {
  const n = cost.length;
  if (!n || cost.some((row) => row.length !== n || row.some((value) => !Number.isFinite(value)))) {
    throw new Error("배정 비용표가 올바르지 않습니다.");
  }
  const u = Array(n + 1).fill(0), v = Array(n + 1).fill(0);
  const p = Array(n + 1).fill(0), way = Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(n + 1).fill(Infinity), used = Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const assignment = Array(n);
  for (let j = 1; j <= n; j++) assignment[p[j] - 1] = j - 1;
  return assignment;
}

export function allocate(config, volunteers) {
  const errors = validateVolunteers(config, volunteers);
  if (errors.length) throw new InputError(errors);
  const normalized = volunteers.map(normalizeVolunteer);
  const slots = config.subjects.flatMap((subject) => Array(subject.capacity).fill(subject.name.trim()));
  const ranks = normalized.map((volunteer) => slots.map((slot) => {
    const index = preferences(volunteer, config).indexOf(slot);
    return index < 0 ? 99 : index + 1;
  }));
  const cost = ranks.map((row) => row.map(preferenceCost));
  const columns = solveAssignment(cost);
  const rows = normalized.map((volunteer, index) => {
    const rank = ranks[index][columns[index]];
    return { ...volunteer, id: index + 1, assigned: slots[columns[index]], rank, match_label: rank === 99 ? "미지망" : `${rank}지망` };
  });
  const summary = config.subjects.map((subject) => ({
    subject: subject.name.trim(), capacity: subject.capacity,
    names: rows.filter((row) => row.assigned === subject.name.trim()).map((row) => row.name),
  }));
  return { rows, summary, cost: columns.reduce((sum, column, row) => sum + cost[row][column], 0) };
}
