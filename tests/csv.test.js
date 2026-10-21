import test from "node:test";
import assert from "node:assert/strict";
import { importVolunteers, parseCsv, toCsv } from "../csv.js";

test("reads BOM, CRLF, commas and line breaks inside quoted cells", () => {
  assert.deepEqual(parseCsv('\uFEFF이름,1지망,2지망\r\n"홍,길동",국어,"수\n학"\r\n'), [["이름", "1지망", "2지망"], ["홍,길동", "국어", "수\n학"]]);
  assert.deepEqual(parseCsv('"가""나",수학'), [['가"나', "수학"]]);
});

test("reads pasted spreadsheet cells separated by tabs and semicolon files", () => {
  assert.equal(importVolunteers("이름\t1지망\t2지망\n홍길동\t국어\t수학")[0].pref2, "수학");
  assert.equal(importVolunteers("이름;1지망;2지망\n홍길동;국어;수학")[0].name, "홍길동");
});

test("finds named columns regardless of order, including old template column names", () => {
  assert.deepEqual(importVolunteers("공부법 2지망,이름,공부법 1지망\n수학,홍길동,국어"), [{ name: "홍길동", pref1: "국어", pref2: "수학", pref3: "" }]);
  assert.equal(importVolunteers("pref3,name,pref2,pref1\n영어,홍길동,수학,국어")[0].pref3, "영어");
});

test("reads headerless records and skips empty rows", () => {
  assert.deepEqual(importVolunteers("홍길동,국어,수학\n,,\n\n"), [{ name: "홍길동", pref1: "국어", pref2: "수학", pref3: "" }]);
});

test("rejects empty files, headers without data, bad quotes and unrecognized header formats", () => {
  for (const text of ["", ",,\n", "이름,1지망,2지망", '"이름,1지망\n홍길동,수학', '"홍길동"x,수학', "이름,잘못된열\n홍길동,국어"]) {
    assert.throws(() => importVolunteers(text), undefined, text);
  }
});

test("exported Unicode CSV round-trips quotes and commas and includes Excel-friendly BOM", () => {
  const rows = [["이름", "1지망", "2지망"], ['홍"길,동', "국어", ""]];
  const csv = toCsv(rows);
  assert(csv.startsWith("\uFEFF"));
  assert.deepEqual(parseCsv(csv), rows);
});

test("spreadsheet formulas in user text are neutralized on export", () => {
  const parsed = parseCsv(toCsv([["=1+1", "+SUM(1)", "@SUM(A1)", "-2+1", "\t=1", 12]]));
  assert.deepEqual(parsed[0], ["'=1+1", "'+SUM(1)", "'@SUM(A1)", "'-2+1", "'\t=1", "12"]);
});
