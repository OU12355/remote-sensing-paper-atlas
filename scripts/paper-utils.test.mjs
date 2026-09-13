import test from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, normalizePaperMetadata } from "./paper-utils.mjs";

test("任一作者机构为 CN 时标记国内研究", () => {
  const paper = normalizePaperMetadata({
    title: "Remote sensing change detection",
    abstract: "A satellite image study.",
    authors: [
      { name: "A. Author", country_code: "US" },
      { name: "B. Author", country_code: "CN" }
    ]
  });
  assert.equal(paper.is_domestic, true);
  assert.equal(paper.domestic_evidence, "affiliation");
});

test("HK、MO、TW 不作为中国大陆研究", () => {
  for (const countryCode of ["HK", "MO", "TW"]) {
    const paper = normalizePaperMetadata({
      title: "Satellite remote sensing",
      authors: [{ name: "Author", country_code: countryCode }]
    });
    assert.equal(paper.is_domestic, false);
    assert.equal(paper.domestic_evidence, "unknown");
  }
});

test("缺少机构国别时不猜测为国内研究", () => {
  const paper = normalizePaperMetadata({ title: "遥感变化检测", authors: [{ name: "张三" }] });
  assert.equal(paper.language, "zh");
  assert.equal(paper.is_domestic, false);
});

test("明确的中文机构名称可作为国内研究证据", () => {
  const paper = normalizePaperMetadata({
    title: "遥感影像分类",
    authors: [{ name: "张三", institution: "武汉大学遥感信息工程学院" }]
  });
  assert.equal(paper.is_domestic, true);
});

test("中文和英文语言可规范化", () => {
  assert.equal(detectLanguage("", "遥感影像变化检测", "摘要"), "zh");
  assert.equal(detectLanguage("ENGLISH", "Remote sensing"), "en");
  assert.equal(detectLanguage("", "Sentinel-2 imagery"), "en");
  assert.equal(detectLanguage("ja", "衛星リモートセンシング"), "ja");
  assert.equal(detectLanguage("zh", "Remote sensing dataset", "English abstract"), "en");
});