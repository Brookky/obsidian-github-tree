import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (name) => readFileSync(resolve(root, name), "utf8");
const readJson = (name) => JSON.parse(read(name));

const readme = read("README.md");
const manifest = readJson("manifest.json");
const source = read("src/main.ts");
const graphView = read("src/graph-view.ts");
const settings = read("src/settings.ts");

assert.equal(manifest.name, "Git Graph");
assert.match(readme, /# Git Graph — Obsidian Plugin/);
assert.match(readme, /로컬 Git 저장소의 커밋 이력과 브랜치 그래프/);
assert.doesNotMatch(readme, /GitHub repository file trees/);
assert.match(readme, /Open Git Graph/);
assert.match(readme, /npm run build/);
assert.match(readme, /npm run docs:test/);
assert.match(source, /name: "Open Git Graph"/);
assert.match(settings, /\.setName\("Max Commits"\)/);
assert.match(settings, /\.setName\("Show All Branches by Default"\)/);
assert.match(graphView, /setAttribute\("role", "button"\)/);
assert.match(graphView, /e\.key !== "Enter" && e\.key !== " "/);
assert.match(graphView, /aria-label.*Repository/);
assert.match(graphView, /aria-label.*Filter commits/);
assert.match(graphView, /aria-label",\s*`Commit \$\{row\.commit\.subject\} by \$\{row\.commit\.author\}, \$\{row\.commit\.relativeDate\}, \$\{row\.commit\.shortHash\}`/s);
assert.match(graphView, /emptyState\.setAttribute\("role", "status"\)/);
assert.match(graphView, /commitCount\.setAttribute\("role", "status"\)/);
assert.match(graphView, /loading\.setAttribute\("role", "status"\)/);
assert.match(graphView, /loading\.setAttribute\("aria-label", "Loading diff"\)/);
assert.match(graphView, /hint\.setAttribute\("role", "status"\)/);
assert.match(graphView, /hint\.setAttribute\("aria-label", "Merge commit — no line diff available\."\)/);
assert.match(graphView, /emptyState\.setAttribute\("role", "status"\)/);
assert.match(graphView, /emptyState\.setAttribute\("aria-label", "No commits found"\)/);
assert.match(graphView, /el\.setAttribute\("role", "status"\)/);
assert.match(graphView, /message\.setAttribute\("role", "status"\)/);
assert.match(graphView, /message\.setAttribute\("aria-label", "No repositories configured"\)/);
assert.match(graphView, /el\.setAttribute\("aria-label", "Reading git log"\)/);

console.log("docs-contract: 26 checks passed");
