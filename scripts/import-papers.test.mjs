import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadManualImports } from "./import-papers.mjs";

test("解析 CNKI RIS、中文 BibTeX 和 EndNote 题录", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rs-imports-"));
  try {
    await writeFile(path.join(directory, "cnki-remote-sensing.ris"), [
      "TY  - JOUR",
      "TI  - 遥感影像变化检测方法",
      "AU  - 张三",
      "AD  - 武汉大学遥感信息工程学院",
      "PY  - 2025",
      "JO  - 遥感学报",
      "AB  - 本文研究多时相遥感影像变化检测。",
      "KW  - 遥感",
      "ER  -"
    ].join("\n"), "utf8");

    await writeFile(path.join(directory, "lab-papers.bib"), [
      "@article{li2024,",
      "  title = {高光谱遥感影像分类}, ",
      "  author = {李四}, ",
      "  affiliation = {中国科学院空天信息创新研究院}, ",
      "  year = {2024}, ",
      "  journal = {遥感学报}",
      "}"
    ].join("\n"), "utf8");

    await writeFile(path.join(directory, "wanfang-change.enw"), [
      "%0 Journal Article",
      "%T 多时相卫星影像变化检测",
      "%A 王五",
      "%D 2023",
      "%J 自然资源遥感",
      "%+ 中国测绘科学研究院"
    ].join("\n"), "utf8");

    const result = await loadManualImports(directory, { now: new Date("2026-09-13T00:00:00Z") });
    assert.equal(result.files, 3);
    assert.equal(result.papers.length, 3);
    const cnki = result.papers.find((paper) => paper.import_source === "CNKI");
    const wanfang = result.papers.find((paper) => paper.import_source === "万方");
    assert.ok(cnki);
    assert.equal(cnki.language, "zh");
    assert.equal(cnki.is_domestic, true);
    assert.match(cnki.title, /遥感影像变化检测/);
    assert.ok(wanfang);
    assert.equal(wanfang.is_domestic, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CNKI 来源本身不能证明论文属于国内研究", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rs-imports-"));
  try {
    await writeFile(path.join(directory, "cnki-no-affiliation.ris"), [
      "TY  - JOUR",
      "TI  - 遥感图像分类研究",
      "AU  - 李雷",
      "PY  - 2025",
      "JO  - 遥感学报",
      "ER  -"
    ].join("\n"), "utf8");
    const result = await loadManualImports(directory);
    assert.equal(result.papers.length, 1);
    assert.equal(result.papers[0].language, "zh");
    assert.equal(result.papers[0].is_domestic, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});