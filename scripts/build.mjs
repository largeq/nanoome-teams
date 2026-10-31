import { cp, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const destination = new URL("../dist/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of ["index.html", "styles.css", "app.js", "allocation.js", "csv.js", "clipboard.js", "favicon.svg", "LICENSE.txt"]) {
  await cp(new URL(file, root), new URL(file, destination));
}
console.log("GitHub Pages에 올릴 파일을 dist/에 준비했습니다.");
