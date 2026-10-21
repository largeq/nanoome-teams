import test from "node:test";
import assert from "node:assert/strict";
import { allocate, defaultConfig, emptyVolunteers, InputError, normalizeConfig, solveAssignment, totalCapacity, validateConfig, validateVolunteers } from "../allocation.js";

function generateSample(config) {
  const valid = normalizeConfig(config);
  let seed = 42;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  return Array.from({ length: totalCapacity(valid) }, (_, index) => {
    const subjects = valid.subjects.map((subject) => subject.name);
    for (let i = subjects.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [subjects[i], subjects[j]] = [subjects[j], subjects[i]];
    }
    return { name: `검증용 ${index + 1}`, pref1: subjects[0], pref2: subjects[1] ?? "", pref3: valid.preference_mode === "three" ? subjects[2] ?? "" : "" };
  });
}

function exhaustiveMinimum(cost) {
  let best = Infinity;
  function visit(row, used, sum) {
    if (row === cost.length) { best = Math.min(best, sum); return; }
    for (let col = 0; col < cost.length; col++) if (!used.has(col)) {
      used.add(col); visit(row + 1, used, sum + cost[row][col]); used.delete(col);
    }
  }
  visit(0, new Set(), 0);
  return best;
}

test("Hungarian results agree with independent exhaustive enumeration, including negative costs and ties", () => {
  let seed = 1977;
  for (let n = 1; n <= 7; n++) {
    for (let sample = 0; sample < 6; sample++) {
      const costs = Array.from({ length: n }, () => Array.from({ length: n }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed % 13 - 3;
      }));
      const columns = solveAssignment(costs);
      assert.equal(new Set(columns).size, n);
      assert.equal(columns.reduce((sum, column, row) => sum + costs[row][column], 0), exhaustiveMinimum(costs));
    }
  }
});

test("global assignment can sacrifice a locally cheaper first pick", () => {
  const costs = [[1, 2], [1, 10]];
  assert.deepEqual(solveAssignment(costs), [1, 0]);
});

test("20-person and 30-person cases fill every program exactly", () => {
  for (const config of [defaultConfig(), { subjects: [{ name: "A", capacity: 9 }, { name: "B", capacity: 13 }, { name: "C", capacity: 8 }], preference_mode: "three" }]) {
    const result = allocate(config, generateSample(config));
    assert.equal(result.rows.length, totalCapacity(config));
    assert.deepEqual(result.rows.map((row) => row.id), Array.from({ length: totalCapacity(config) }, (_, i) => i + 1));
    for (const team of result.summary) assert.equal(team.names.length, team.capacity);
    assert.equal(result.summary.reduce((sum, team) => sum + team.names.length, 0), totalCapacity(config));
  }
});

const threeSubjects = { subjects: ["A", "B", "C"].map((name) => ({ name, capacity: 1 })), preference_mode: "three" };
const competing = [{ name: "가", pref1: "A", pref2: "B", pref3: "C" }, { name: "나", pref1: "A" }, { name: "다", pref1: "B" }];

test("third preference costs 2 when enabled and is ignored in two-preference mode", () => {
  const result = allocate(threeSubjects, competing);
  assert.equal(result.cost, 2);
  assert.equal(result.rows[0].assigned, "C");
  assert.equal(result.rows[0].match_label, "3지망");
  const two = allocate({ ...threeSubjects, preference_mode: "two" }, competing);
  assert.equal(two.cost, 10);
  assert.equal(two.rows.filter((row) => row.rank === 99).length, 1);
});

test("allows optional preferences, including a blank second preference in three-preference mode", () => {
  assert.deepEqual(validateVolunteers(threeSubjects, [{ name: "가", pref1: "A", pref3: "C" }, { name: "나", pref1: "A" }, { name: "다", pref1: "B" }]), []);
});

test("rejects empty names, missing first preferences, duplicate preferences and unknown subjects", () => {
  const errors = validateVolunteers(threeSubjects, [{ name: "", pref1: "A" }, { name: "나", pref1: "", pref2: "B" }, { name: "다", pref1: "X", pref2: "X" }]);
  assert(errors.some((line) => line.includes("이름")));
  assert(errors.some((line) => line.includes("1지망")));
  assert(errors.some((line) => line.includes("설정에 없는")));
  assert(errors.some((line) => line.includes("서로 다른")));
  assert.throws(() => allocate(threeSubjects, []), InputError);
});

test("rejects fractional, zero, excessive and malformed capacities", () => {
  for (const capacity of [0, -1, 1.5, 31, NaN, Infinity, "4"]) {
    assert(validateConfig({ subjects: [{ name: "국어", capacity }], preference_mode: "two" }).length > 0);
  }
  assert(validateConfig({ subjects: [{ name: "국어", capacity: 20 }, { name: "수학", capacity: 20 }], preference_mode: "two" }).length > 0);
  assert(validateConfig({ subjects: [null], preference_mode: "two" }).length > 0);
  assert(validateConfig({ subjects: [], preference_mode: "two" }).length > 0);
});

test("normalizes program whitespace and rejects duplicate program names", () => {
  assert.equal(normalizeConfig({ subjects: [{ name: " 국어 ", capacity: 1 }], preference_mode: "two" }).subjects[0].name, "국어");
  assert(validateConfig({ subjects: [{ name: "국어", capacity: 1 }, { name: " 국어 ", capacity: 1 }], preference_mode: "two" }).length > 0);
});

test("trims input and treats nan/none/nat as unfilled optional preferences", () => {
  const config = { subjects: [{ name: "국어", capacity: 1 }], preference_mode: "three" };
  const result = allocate(config, [{ name: " 홍길동 ", pref1: " 국어 ", pref2: "nan", pref3: "None" }]);
  assert.equal(result.rows[0].name, "홍길동");
  assert.equal(result.rows[0].pref2, "");
  assert.equal(result.cost, 0);
});

test("one program and one volunteer work; malformed matrices are rejected", () => {
  const config = { subjects: [{ name: "팀", capacity: 1 }], preference_mode: "three" };
  assert.equal(allocate(config, generateSample(config)).cost, 0);
  assert.throws(() => solveAssignment([]));
  assert.throws(() => solveAssignment([[1, 2]]));
  assert.throws(() => solveAssignment([[Infinity]]));
  assert.equal(emptyVolunteers(2).length, 2);
});
