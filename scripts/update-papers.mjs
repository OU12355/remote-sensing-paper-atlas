#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManualImports } from "./import-papers.mjs";
import { mergeImportSource, normalizePaperMetadata } from "./paper-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const OUTPUT_FILE = path.join(DATA_DIR, "papers.json");
const RSS_FILE = path.join(ROOT, "public", "feed.xml");
const SUMMARY_FILE = path.join(DATA_DIR, "summary.json");
const ROBOTS_FILE = path.join(ROOT, "public", "robots.txt");
const SITEMAP_FILE = path.join(ROOT, "public", "sitemap.xml");
const IMPORTS_DIR = path.join(ROOT, "imports");
const QUICK = process.argv.includes("--quick");
const NOW = new Date();
const TODAY = isoDate(NOW);
const MAILTO = process.env.ATLAS_MAILTO || "remote-sensing-atlas@users.noreply.github.com";
const SITE_URL = (process.env.ATLAS_SITE_URL || "https://example.github.io/remote-sensing-paper-atlas/").replace(/\/?$/, "/");
const USER_AGENT = `RemoteSensingPaperAtlas/1.0 (${MAILTO})`;
const MAX_PAPERS = Number(process.env.ATLAS_MAX_PAPERS || 100000);

const QUERIES = [
  { key: "remote-sensing", label: "遥感", q: "remote sensing", core: true },
  { key: "earth-observation", label: "地球观测", q: "earth observation", core: true },
  { key: "satellite-imagery", label: "卫星影像", q: "satellite imagery", core: true },
  { key: "hyperspectral", label: "高光谱", q: "hyperspectral remote sensing", core: true },
  { key: "sar", label: "SAR", q: "synthetic aperture radar remote sensing", core: true },
  { key: "insar", label: "InSAR", q: "interferometric synthetic aperture radar", core: true },
  { key: "lidar", label: "LiDAR", q: "LiDAR remote sensing", core: true },
  { key: "optical", label: "光学遥感", q: "optical remote sensing", core: true },
  { key: "multispectral", label: "多光谱", q: "multispectral remote sensing", core: true },
  { key: "thermal", label: "热红外遥感", q: "thermal infrared remote sensing", core: true },
  { key: "uav", label: "无人机遥感", q: "UAV remote sensing", core: true },
  { key: "atmospheric", label: "大气遥感", q: "atmospheric remote sensing", core: true },
  { key: "ocean-color", label: "海洋水色", q: "ocean color remote sensing" },
  { key: "vegetation", label: "植被遥感", q: "vegetation remote sensing" },
  { key: "agriculture", label: "农业遥感", q: "agricultural remote sensing" },
  { key: "land-cover", label: "土地覆盖", q: "land cover classification satellite" },
  { key: "change-detection", label: "变化检测", q: "remote sensing change detection" },
  { key: "image-fusion", label: "影像融合", q: "remote sensing image fusion" },
  { key: "semantic-segmentation", label: "语义分割", q: "remote sensing semantic segmentation" },
  { key: "object-detection", label: "目标检测", q: "remote sensing object detection" },
  { key: "foundation-model", label: "遥感基础模型", q: "remote sensing foundation model" },
  { key: "point-cloud", label: "点云", q: "airborne laser scanning point cloud" },
  { key: "soil", label: "土壤遥感", q: "soil remote sensing" },
  { key: "cryosphere", label: "冰冻圈遥感", q: "snow and glacier remote sensing" },
  { key: "disaster", label: "灾害遥感", q: "disaster remote sensing monitoring" },
  { key: "urban", label: "城市遥感", q: "urban remote sensing" }
];

const CHINESE_QUERIES = [
  { key: "zh-remote-sensing", label: "中文遥感", q: "遥感", chinese: true, core: true },
  { key: "zh-earth-observation", label: "中文地球观测", q: "对地观测", chinese: true, core: true },
  { key: "zh-satellite", label: "中文卫星遥感", q: "卫星遥感", chinese: true, core: true },
  { key: "zh-hyperspectral", label: "中文高光谱", q: "高光谱遥感", chinese: true, core: true },
  { key: "zh-sar", label: "中文合成孔径雷达", q: "合成孔径雷达", chinese: true, core: true },
  { key: "zh-lidar", label: "中文激光雷达", q: "激光雷达遥感", chinese: true, core: true },
  { key: "zh-change", label: "中文变化检测", q: "遥感变化检测", chinese: true, core: true },
  { key: "zh-agriculture", label: "中文农业遥感", q: "农业遥感", chinese: true, core: true },
  { key: "zh-urban", label: "中文城市遥感", q: "城市遥感", chinese: true, core: true }
];

const DOMESTIC_OPENALEX_QUERIES = [
  { key: "cn-remote-sensing", label: "中国机构遥感", q: "remote sensing", core: true },
  { key: "cn-earth-observation", label: "中国机构地球观测", q: "earth observation", core: true },
  { key: "cn-satellite-imagery", label: "中国机构卫星影像", q: "satellite imagery", core: true },
  { key: "cn-sar", label: "中国机构SAR", q: "synthetic aperture radar", core: true },
  { key: "cn-hyperspectral", label: "中国机构高光谱", q: "hyperspectral remote sensing", core: true },
  { key: "cn-lidar", label: "中国机构LiDAR", q: "LiDAR remote sensing", core: true }
];

const CROSSREF_JOURNALS = [
  { key: "journal-remote-sensing", label: "遥感学报", issn: "1007-4619" },
  { key: "journal-radars", label: "雷达学报", issn: "2095-283X" },
  { key: "journal-image-graphics", label: "中国图象图形学报", issn: "1006-8961" }
];
const TOPIC_RULES = [
  { name: "SAR / InSAR", pattern: /synthetic aperture radar|\binsar\b|\bsar\b|interferometr|polarimetr|radar remote sensing|合成孔径雷达|干涉合成孔径雷达|干涉测量|极化雷达|雷达遥感|雷达成像/i },
  { name: "高光谱", pattern: /hyperspectral|imaging spectroscopy|spectral unmixing|spectral library|高光谱|光谱解混|成像光谱/i },
  { name: "LiDAR / 点云", pattern: /\blidar\b|airborne laser|point cloud|laser scanning|photogrammetr|激光雷达|机载激光|点云|摄影测量/i },
  { name: "热红外", pattern: /thermal infrared|land surface temperature|\bthermal remote|热红外|地表温度/i },
  { name: "大气遥感", pattern: /atmospheric remote|atmosphere|aerosol|cloud propert|trace gas|air quality|大气遥感|气溶胶|云特性|痕量气体|空气质量/i },
  { name: "海洋与水体", pattern: /ocean color|ocean remote|sea surface|water quality|inland water|coastal water|海洋水色|海表|水质|内陆水体|近岸水体|海洋遥感/i },
  { name: "植被与农业", pattern: /vegetation|forest|agricultur|crop|leaf area|phenolog|grassland|yield estim|植被|森林|农作物|作物|叶面积|物候|草地|产量估算|农业遥感/i },
  { name: "土地与城市", pattern: /land cover|land use|urban|built-up|impervious|city mapping|土地覆盖|土地利用|城市|建成区|不透水面|城市遥感/i },
  { name: "变化检测", pattern: /change detection|change monitoring|time series analysis|multi-temporal|multitemporal|变化检测|变化监测|时间序列分析|多时相/i },
  { name: "灾害与应急", pattern: /disaster|earthquake|landslide|wildfire|flood|drought|hurricane|emergency mapping|灾害|地震|滑坡|野火|洪涝|洪水|干旱|台风|应急测绘/i },
  { name: "冰冻圈", pattern: /snow|glacier|ice sheet|sea ice|permafrost|cryosphere|积雪|冰川|冰盖|海冰|冻土|冰冻圈/i },
  { name: "土壤与地质", pattern: /soil|geolog|mineral mapping|rock|erosion|subsidence|土壤|地质|矿物填图|岩石|侵蚀|沉降/i },
  { name: "目标检测与分割", pattern: /object detection|semantic segmentation|instance segmentation|scene classification|target recognition|目标检测|语义分割|实例分割|场景分类|目标识别/i },
  { name: "基础模型与 AI", pattern: /foundation model|large language model|vision transformer|self-supervised|deep learning|machine learning|neural network|基础模型|大语言模型|视觉变换器|自监督|深度学习|机器学习|神经网络/i },
  { name: "影像融合与重建", pattern: /image fusion|pan-sharpening|super-resolution|data fusion|image reconstruction|cloud removal|图像融合|影像融合|全色锐化|超分辨率|数据融合|图像重建|去云|影像重建/i },
  { name: "定标与反演", pattern: /calibration|radiometric|atmospheric correction|retrieval algorithm|inversion|reflectance|定标|辐射定标|大气校正|反演|反射率/i },
  { name: "无人机遥感", pattern: /\buav\b|unmanned aerial|drone|airborne remote|无人机|无人飞行器|航拍|机载遥感/i }
];

const ENABLED_SOURCES = new Set(String(process.env.ATLAS_SOURCES || "OpenAlex,Crossref,arXiv").split(",").map((value) => value.trim()).filter(Boolean));
const ACTIVE_QUERIES = QUERIES.slice(0, Math.max(1, Number(process.env.ATLAS_QUERY_LIMIT || QUERIES.length)));
const ACTIVE_CHINESE_QUERIES = CHINESE_QUERIES.slice(0, Math.max(0, Number(process.env.ATLAS_CHINESE_QUERY_LIMIT ?? CHINESE_QUERIES.length)));
const ACTIVE_DOMESTIC_QUERIES = DOMESTIC_OPENALEX_QUERIES.slice(0, Math.max(0, Number(process.env.ATLAS_DOMESTIC_QUERIES ?? DOMESTIC_OPENALEX_QUERIES.length)));
const CROSSREF_QUERIES = [...ACTIVE_QUERIES, ...ACTIVE_CHINESE_QUERIES, ...CROSSREF_JOURNALS];

const SOURCE_LABELS = {
  OpenAlex: "OpenAlex",
  Crossref: "Crossref",
  arXiv: "arXiv"
};

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days) {
  const date = new Date(NOW);
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  process.stdout.write(`${new Date().toISOString()} ${message}\n`);
}

async function readExisting() {
  try {
    const raw = await readFile(OUTPUT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.papers) ? parsed.papers : [];
  } catch {
    return [];
  }
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, max = 6000) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function normalizeDoi(value) {
  return cleanText(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
}

function normalizeTitle(value) {
  return cleanText(value)
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableId(prefix, value) {
  const hash = createHash("sha1").update(String(value)).digest("hex").slice(0, 16);
  return `${prefix}:${hash}`;
}

function paperKey(paper) {
  const title = normalizeTitle(paper.title);
  const year = paper.year || paper.published_date?.slice(0, 4) || "";
  return `title:${title}|${year}`;
}

function isRelevantPaper(paper) {
  const text = [
    paper.title,
    paper.abstract,
    ...(paper.keywords || [])
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  const strong = /remote sensing|earth observation|satellite remote|spaceborne remote|airborne remote|aerial remote|satellite imagery|satellite image|hyperspectral imag|multispectral imag|radar imagery|interferometric synthetic aperture radar|遥感|对地观测|卫星遥感|航空遥感|航天遥感|卫星影像|卫星图像|遥感影像|遥感图像/;
  const technique = /\bhyperspectral\b|\bmultispectral\b|synthetic aperture radar|\binsar\b|\blidar\b|photogrammetr|spectral unmixing|atmospheric correction|radiometric calibration|normalized difference vegetation index|\bndvi\b|ocean color remote|land surface temperature retriev|高光谱|多光谱|合成孔径雷达|激光雷达|点云|摄影测量|光谱解混|大气校正|辐射定标|植被指数/;
  const geospatial = /satellite|spaceborne|airborne|aerial|\buav\b|drone|earth|land|vegetation|crop|forest|ocean|water|soil|urban|atmosphere|glacier|snow|ice|surface|spatial|geospatial|mapping|monitoring|classification|retrieval|detection|imagery|imaging|卫星|航空|无人机|地表|土地|植被|作物|森林|海洋|水体|土壤|城市|大气|冰川|积雪|冰盖|空间|测绘|监测|分类|反演|检测/;
  const sensor = /\bsentinel(?:-|\s)?\d|\blandsat\b|\bmodis\b|\bspot(?:-|\s)?\d|\bgaofen\b|worldview|rapideye|planet scope|terrasar|radarsat|alos|envisat|grace satellite|高分|资源卫星|环境卫星|风云|天绘|吉林一号/;
  return strong.test(text) || technique.test(text) || (sensor.test(text) && geospatial.test(text));
}
function isValidPaperDate(value) {
  if (!value) return true;
  const timestamp = new Date(`${value}T00:00:00Z`).getTime();
  if (Number.isNaN(timestamp)) return false;
  const earliest = Date.UTC(1900, 0, 1);
  const latest = NOW.getTime() + 370 * 86400000;
  return timestamp >= earliest && timestamp <= latest;
}async function fetchText(url, options = {}, label = "request") {
  const attempts = Number(options.retries || process.env.ATLAS_RETRIES || 4);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.ATLAS_TIMEOUT_MS || 45000));
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: options.accept || "application/json, text/plain, */*",
          ...(options.headers || {})
        }
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 180)}` : ""}`);
      }
      return await response.text();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < attempts) await sleep(900 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`${label} failed: ${lastError?.message || "unknown error"}`);
}

async function fetchJson(url, label, options = {}) {
  const text = await fetchText(url, { accept: "application/json", ...options }, label);
  return JSON.parse(text);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        log(`WARN ${items[index]?.key || index}: ${error.message}`);
        results[index] = [];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results.flat();
}

function reconstructAbstract(index) {
  if (!index || typeof index !== "object") return "";
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions || []) words[position] = word;
  }
  return words.filter(Boolean).join(" ");
}

function openAlexToPaper(work, query) {
  const title = cleanText(work.display_name || work.title);
  if (!title) return null;
  const doi = normalizeDoi(work.doi);
  const primary = work.primary_location || {};
  const bestOa = work.best_oa_location || {};
  const source = primary.source || {};
  const publishedDate = work.publication_date || "";
  const authors = (work.authorships || []).map((authorship) => {
    const institutions = (authorship.institutions || []).map((institution) => ({
      name: cleanText(institution.display_name),
      country_code: cleanText(institution.country_code).toUpperCase()
    })).filter((institution) => institution.name || institution.country_code);
    const countryCodes = [...new Set([
      cleanText(authorship.country_code).toUpperCase(),
      ...(authorship.countries || []).map((code) => cleanText(code).toUpperCase()),
      ...institutions.map((institution) => institution.country_code)
    ].filter((code) => /^[A-Z]{2}$/.test(code)))];
    return {
      name: cleanText(authorship.author?.display_name),
      orcid: authorship.author?.orcid || "",
      institution: institutions.map((institution) => institution.name).filter(Boolean)[0] || "",
      country_code: countryCodes[0] || "",
      country_codes: countryCodes
    };
  }).filter((author) => author.name);
  const sourceKeywords = [
    ...(work.topics || []).map((topic) => cleanText(topic.display_name)),
    ...(work.keywords || []).map((keyword) => cleanText(keyword.display_name))
  ].filter(Boolean);
  const id = doi ? `doi:${doi}` : stableId("openalex", work.id || title);
  return normalizePaperMetadata({
    id,
    title: truncate(title, 500),
    abstract: truncate(reconstructAbstract(work.abstract_inverted_index), 7000),
    authors,
    published_date: publishedDate,
    year: Number(publishedDate.slice(0, 4)) || null,
    venue: cleanText(source.display_name || work.host_venue?.display_name),
    publisher: cleanText(source.host_organization_name || work.publisher),
    type: cleanText(work.type_crossref || work.type),
    doi,
    url: cleanText(primary.landing_page_url || work.doi || work.id),
    pdf_url: cleanText(bestOa.pdf_url || primary.pdf_url),
    open_access: Boolean(work.open_access?.is_oa || bestOa.is_oa),
    cited_by_count: Number(work.cited_by_count || 0),
    language: cleanText(work.language),
    keywords: sourceKeywords,
    source: "OpenAlex",
    sources: ["OpenAlex"],
    query_hits: [query.label],
    indexed_at: NOW.toISOString()
  });
}
async function fetchOpenAlex(existingCount) {
  const pageLimit = Number(process.env.ATLAS_OPENALEX_PAGES || (QUICK ? 1 : existingCount ? 1 : 2));
  const domesticPageLimit = Number(process.env.ATLAS_DOMESTIC_PAGES || 1);
  const dateField = existingCount ? "from_created_date" : "from_publication_date";
  const fromDate = process.env.ATLAS_FROM_DATE || (existingCount ? dateDaysAgo(45) : dateDaysAgo(Number(process.env.ATLAS_INITIAL_DAYS || 3650)));

  async function collect(querySet, currentPageLimit, extraFilter, label) {
    if (!querySet.length || currentPageLimit < 1) return [];
    log(`${label}: querying ${querySet.length} topics since ${fromDate} (${currentPageLimit} page(s) per topic)`);
    return mapLimit(querySet, Number(process.env.ATLAS_CONCURRENCY || 3), async (query) => {
      const found = [];
      let cursor = "*";
      for (let page = 0; page < currentPageLimit && cursor; page += 1) {
        const filters = [`${dateField}:${fromDate}`, extraFilter].filter(Boolean);
        const params = new URLSearchParams({
          search: query.q,
          filter: filters.join(","),
          sort: "publication_date:desc",
          "per-page": "200",
          cursor,
          select: "id,doi,title,display_name,authorships,publication_date,primary_location,best_oa_location,open_access,type,type_crossref,topics,keywords,cited_by_count,language,abstract_inverted_index",
          mailto: MAILTO
        });
        const payload = await fetchJson(`https://api.openalex.org/works?${params}`, `OpenAlex ${query.key} page ${page + 1}`, { retries: QUICK ? 1 : 2 });
        for (const work of payload.results || []) {
          const paper = openAlexToPaper(work, query);
          if (paper) found.push(paper);
        }
        cursor = payload.meta?.next_cursor || "";
      }
      return found;
    });
  }

  const domestic = await collect(ACTIVE_DOMESTIC_QUERIES, domesticPageLimit, "institutions.country_code:cn", "OpenAlex 国内机构");
  const general = await collect(ACTIVE_QUERIES, pageLimit, "", "OpenAlex");
  return [...general, ...domestic];
}
function crossrefDate(item) {
  const candidate = item["published-online"] || item.published || item["published-print"] || item.issued || item.created;
  const parts = candidate?.["date-parts"]?.[0];
  if (!parts?.length) return "";
  const [year, month = 1, day = 1] = parts;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function crossrefToPaper(item, query) {
  const title = cleanText(item.title?.[0] || item["original-title"]?.[0]);
  if (!title) return null;
  const doi = normalizeDoi(item.DOI);
  const publishedDate = crossrefDate(item);
  const authors = (item.author || []).map((author) => ({
    name: cleanText([author.given, author.family].filter(Boolean).join(" ") || author.name),
    orcid: author.ORCID || "",
    institution: cleanText(author.affiliation?.[0]?.name),
    country_code: ""
  })).filter((author) => author.name);
  const license = Array.isArray(item.license) ? item.license[0] : null;
  const links = Array.isArray(item.link) ? item.link : [];
  const pdfUrl = links.find((link) => /pdf/i.test(link["content-type"] || "") || /pdf/i.test(link.URL || ""))?.URL || "";
  const id = doi ? `doi:${doi}` : stableId("crossref", title + publishedDate);
  return normalizePaperMetadata({
    id,
    title: truncate(title, 500),
    abstract: truncate(item.abstract, 7000),
    authors,
    published_date: publishedDate,
    year: Number(publishedDate.slice(0, 4)) || null,
    venue: cleanText(item["container-title"]?.[0] || item.event?.name || ""),
    publisher: cleanText(item.publisher),
    type: cleanText(item.type),
    doi,
    url: cleanText(item.URL || (doi ? `https://doi.org/${doi}` : "")),
    pdf_url: cleanText(pdfUrl),
    open_access: Boolean(pdfUrl || /creativecommons|open access|openaccess/i.test(license?.URL || "")),
    cited_by_count: Number(item["is-referenced-by-count"] || 0),
    language: cleanText(item.language),
    keywords: [...(item.subject || []), ...(item["container-title"] || [])].map(cleanText).filter(Boolean),
    source: "Crossref",
    sources: ["Crossref"],
    query_hits: [query.label],
    indexed_at: NOW.toISOString()
  });
}
async function fetchCrossref(existingCount) {
  const pageLimit = Number(process.env.ATLAS_CROSSREF_PAGES || (QUICK ? 1 : existingCount ? 1 : 5));
  const journalPageLimit = Number(process.env.ATLAS_JOURNAL_PAGES || (QUICK ? 1 : existingCount ? 1 : 10));
  const dateField = existingCount ? "from-index-date" : "from-pub-date";
  const fromDate = process.env.ATLAS_FROM_DATE || (existingCount ? dateDaysAgo(60) : dateDaysAgo(Number(process.env.ATLAS_INITIAL_DAYS || 3650)));
  log(`Crossref: querying ${CROSSREF_QUERIES.length} topics/journals since ${fromDate}`);
  return mapLimit(CROSSREF_QUERIES, Number(process.env.ATLAS_CONCURRENCY || 3), async (query) => {
    const found = [];
    const currentPageLimit = query.issn ? journalPageLimit : query.chinese ? Number(process.env.ATLAS_CHINESE_PAGES || 1) : pageLimit;
    let cursor = "*";
    for (let page = 0; page < currentPageLimit && cursor; page += 1) {
      const params = new URLSearchParams({
        rows: "100",
        cursor,
        select: "DOI,title,original-title,author,abstract,URL,published,published-online,published-print,issued,created,container-title,short-container-title,type,subject,is-referenced-by-count,link,license,publisher",
        mailto: MAILTO
      });
      if (query.issn) {
        params.set("filter", `${dateField}:${fromDate},type:journal-article,issn:${query.issn}`);
      } else {
        params.set("query.bibliographic", query.q);
        params.set("filter", `${dateField}:${fromDate},type:journal-article`);
      }
      const payload = await fetchJson(`https://api.crossref.org/works?${params}`, `Crossref ${query.key} page ${page + 1}`, { retries: QUICK ? 1 : 2 });
      for (const item of payload.message?.items || []) {
        const paper = crossrefToPaper(item, query);
        if (paper) found.push(paper);
      }
      cursor = payload.message?.["next-cursor"] || "";
    }
    return found;
  });
}
function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? cleanText(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
}

function parseArxivEntries(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  return entries.map((entry) => {
    const links = [...entry.matchAll(/<link\b([^>]*)\/?>/gi)].map((match) => match[1]);
    const href = (attrs) => attrs.match(/href="([^"]+)"/i)?.[1] || "";
    const alternate = links.find((attrs) => /rel="alternate"/i.test(attrs));
    const pdf = links.find((attrs) => /title="pdf"/i.test(attrs));
    return {
      id: xmlValue(entry, "id"),
      title: xmlValue(entry, "title"),
      abstract: xmlValue(entry, "summary"),
      published: xmlValue(entry, "published"),
      updated: xmlValue(entry, "updated"),
      authors: [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)].map((match) => cleanText(match[1])),
      categories: [...entry.matchAll(/<category\b[^>]*term="([^"]+)"/gi)].map((match) => match[1]),
      journal: xmlValue(entry, "arxiv:journal_ref") || xmlValue(entry, "journal_ref"),
      doi: xmlValue(entry, "arxiv:doi") || xmlValue(entry, "doi"),
      url: href(alternate || ""),
      pdf_url: href(pdf || "")
    };
  });
}

async function fetchArxiv() {
  const requested = Number(process.env.ATLAS_ARXIV_QUERIES ?? (QUICK ? 3 : 14));
  const orderedQueries = [...ACTIVE_QUERIES.filter((query) => query.core), ...ACTIVE_QUERIES.filter((query) => !query.core)];
  const querySet = requested > 0 ? orderedQueries.slice(0, requested) : [];
  const records = [];
  log(`arXiv: querying ${querySet.length} topics`);
  for (const [index, query] of querySet.entries()) {
    try {
      const params = new URLSearchParams({
        search_query: `all:"${query.q}"`,
        start: "0",
        max_results: String(Number(process.env.ATLAS_ARXIV_RESULTS || 100)),
        sortBy: "submittedDate",
        sortOrder: "descending"
      });
      const xml = await fetchText(`https://export.arxiv.org/api/query?${params}`, { accept: "application/atom+xml", retries: QUICK ? 1 : 2 }, `arXiv ${query.key}`);
      for (const item of parseArxivEntries(xml)) {
        const publishedDate = item.published.slice(0, 10);
        const title = cleanText(item.title);
        const arxivId = item.id.split("/").pop() || title;
        const doi = normalizeDoi(item.doi);
        if (!title) continue;
        records.push({
          id: doi ? `doi:${doi}` : `arxiv:${arxivId}`,
          title: truncate(title, 500),
          abstract: truncate(item.abstract, 7000),
          authors: item.authors.map((name) => ({ name })),
          published_date: publishedDate,
          year: Number(publishedDate.slice(0, 4)) || null,
          venue: cleanText(item.journal || "arXiv preprint"),
          publisher: "arXiv",
          type: item.journal ? "journal-article" : "preprint",
          doi,
          url: cleanText(item.url || `https://arxiv.org/abs/${arxivId}`),
          pdf_url: cleanText(item.pdf_url || `https://arxiv.org/pdf/${arxivId}`),
          open_access: true,
          cited_by_count: 0,
          language: "en",
          keywords: item.categories,
          source: "arXiv",
          sources: ["arXiv"],
          query_hits: [query.label],
          indexed_at: NOW.toISOString()
        });
      }
      log(`arXiv: ${index + 1}/${querySet.length} ${query.key}`);
    } catch (error) {
      log(`WARN arXiv ${query.key}: ${error.message}`);
    }
    if (index < querySet.length - 1) await sleep(Number(process.env.ATLAS_ARXIV_DELAY_MS || 3200));
  }
  return records;
}

function classifyTopics(paper) {
  const text = [
    paper.title,
    paper.abstract,
    ...(paper.keywords || []),
    ...(paper.query_hits || [])
  ].filter(Boolean).join(" ");
  const scored = TOPIC_RULES.map((rule, index) => ({ name: rule.name, score: (text.match(new RegExp(rule.pattern.source, "gi")) || []).length, index }))
    .filter((topic) => topic.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 4)
    .map((topic) => topic.name);
  if (scored.length) return scored;
  if (/remote sensing|earth observation|satellite/i.test(text)) return ["遥感基础"];
  return ["遥感基础"];
}

function mergeStringArrays(...arrays) {
  return [...new Set(arrays.flat().filter(Boolean).map(cleanText))];
}

function mergeAuthorArrays(...arrays) {
  const map = new Map();
  for (const author of arrays.flat()) {
    const name = cleanText(author?.name || author);
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const previous = map.get(key) || {};
    const countryCodes = [...new Set([
      ...(previous.country_codes || []),
      previous.country_code,
      author?.country_code,
      ...(author?.country_codes || [])
    ].map((code) => cleanText(code).toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
    map.set(key, {
      ...previous,
      ...author,
      name,
      orcid: author?.orcid || previous.orcid || "",
      institution: author?.institution || previous.institution || "",
      country_code: countryCodes[0] || "",
      country_codes: countryCodes
    });
  }
  return [...map.values()];
}
function preferText(primary, secondary) {
  const first = cleanText(primary);
  const second = cleanText(secondary);
  return first.length >= second.length ? first : second;
}

function mergePaper(base, incoming) {
  const mergedSources = mergeStringArrays(base.sources || [base.source], incoming.sources || [incoming.source]);
  const mergedAuthors = mergeAuthorArrays(base.authors || [], incoming.authors || []);
  const mergedKeywords = mergeStringArrays(base.keywords || [], incoming.keywords || []);
  const mergedQueryHits = mergeStringArrays(base.query_hits || [], incoming.query_hits || []);
  const merged = {
    ...base,
    title: preferText(base.title, incoming.title),
    abstract: preferText(base.abstract, incoming.abstract),
    authors: mergedAuthors,
    published_date: base.published_date || incoming.published_date,
    year: base.year || incoming.year,
    venue: preferText(base.venue, incoming.venue),
    publisher: preferText(base.publisher, incoming.publisher),
    type: base.type || incoming.type,
    doi: normalizeDoi(base.doi || incoming.doi),
    url: base.url || incoming.url,
    pdf_url: base.pdf_url || incoming.pdf_url,
    open_access: Boolean(base.open_access || incoming.open_access),
    cited_by_count: Math.max(Number(base.cited_by_count || 0), Number(incoming.cited_by_count || 0)),
    language: base.language || incoming.language,
    keywords: mergedKeywords,
    source: mergedSources.join(" + "),
    sources: mergedSources,
    import_source: mergeImportSource(base.import_source, incoming.import_source).join(" + "),
    query_hits: mergedQueryHits,
    is_domestic: Boolean(base.is_domestic || incoming.is_domestic),
    domestic_evidence: base.is_domestic || incoming.is_domestic ? "affiliation" : "unknown",
    indexed_at: incoming.indexed_at || base.indexed_at || NOW.toISOString(),
    validated: Boolean(base.validated || incoming.validated)
  };
  merged.topics = classifyTopics(merged);
  return normalizePaperMetadata(merged);
}
function deduplicate(papers) {
  const map = new Map();
  for (const raw of papers) {
    const normalized = normalizePaperMetadata(raw);
    const paper = {
      ...normalized,
      topics: classifyTopics(normalized),
      sources: mergeStringArrays(normalized.sources || [normalized.source])
    };
    if (paper.sources.length === 1 && paper.sources[0] === "Crossref" && !paper.pdf_url) paper.open_access = false;
    if (!paper.title || paper.title.length < 8 || !isValidPaperDate(paper.published_date) || (!paper.validated && !isRelevantPaper(paper))) continue;
    const key = paperKey(paper);
    if (map.has(key)) map.set(key, mergePaper(map.get(key), paper));
    else map.set(key, paper);
  }
  return [...map.values()].sort((a, b) => String(b.published_date || "").localeCompare(String(a.published_date || "")));
}
function countBy(papers, selector) {
  const counts = new Map();
  for (const paper of papers) {
    const values = selector(paper);
    for (const value of Array.isArray(values) ? values : [values]) {
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function buildSummary(papers, sourceStatus) {
  const topicCounts = countBy(papers, (paper) => paper.topics || []);
  const sourceCounts = countBy(papers, (paper) => paper.sources || [paper.source]);
  const domesticPapers = papers.filter((paper) => paper.is_domestic);
  const allSources = [...new Set(papers.flatMap((paper) => paper.sources || [paper.source]))].sort();
  return {
    generated_at: NOW.toISOString(),
    total: papers.length,
    open_access: papers.filter((paper) => paper.open_access).length,
    domestic_count: domesticPapers.length,
    chinese_count: papers.filter((paper) => paper.language === "zh").length,
    recent_7_days: papers.filter((paper) => {
      if (!paper.published_date) return false;
      const age = NOW.getTime() - new Date(`${paper.published_date}T00:00:00Z`).getTime();
      return age >= 0 && age <= 7 * 86400000;
    }).length,
    date_range: {
      earliest: papers.map((paper) => paper.published_date).filter(Boolean).sort()[0] || null,
      latest: papers.map((paper) => paper.published_date).filter(Boolean).sort().at(-1) || null
    },
    sources: allSources,
    source_counts: sourceCounts,
    domestic_source_counts: countBy(domesticPapers, (paper) => paper.sources || [paper.source]),
    source_status: sourceStatus,
    topics: Object.keys(topicCounts),
    topic_counts: topicCounts,
    type_counts: countBy(papers, (paper) => paper.type || "unknown"),
    language_counts: countBy(papers, (paper) => paper.language || "unknown"),
    update_schedule: "每天 03:17 UTC（约北京时间 11:17）"
  };
}
function xmlEscape(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildRss(papers) {
  const items = papers.slice(0, 100).map((paper) => {
    const link = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : SITE_URL);
    const markers = `${paper.is_domestic ? "[国内] " : ""}${paper.language === "zh" ? "[中文] " : ""}`;
    const description = `${markers}${paper.abstract || `${paper.venue || "遥感论文"} ${paper.doi ? `DOI: ${paper.doi}` : ""}`}`;
    return `    <item>\n      <title>${xmlEscape(paper.title)}</title>\n      <link>${xmlEscape(link)}</link>\n      <guid isPermaLink="false">${xmlEscape(paper.id)}</guid>\n      <pubDate>${new Date(`${paper.published_date || TODAY}T00:00:00Z`).toUTCString()}</pubDate>\n      <description>${xmlEscape(description)}</description>\n      <category>${xmlEscape((paper.topics || []).join(", "))}</category>\n    </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>遥感论文雷达</title>\n    <link>${xmlEscape(SITE_URL)}</link>\n    <description>持续更新的遥感论文聚合索引</description>\n    <language>zh-cn</language>\n    <lastBuildDate>${NOW.toUTCString()}</lastBuildDate>\n${items}\n  </channel>\n</rss>\n`;
}

function buildSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${xmlEscape(SITE_URL)}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`;
}

function compactPaperForOutput(paper) {
  const { query_hits, ...compact } = paper;
  return {
    ...compact,
    abstract: truncate(paper.abstract, 2200),
    authors: (paper.authors || []).slice(0, 60).map((author) => {
      const compactAuthor = { name: cleanText(author.name || author) };
      const countryCode = cleanText(author.country_code).toUpperCase();
      if (/^[A-Z]{2}$/.test(countryCode)) compactAuthor.country_code = countryCode;
      return compactAuthor;
    }).filter((author) => author.name),
    keywords: (paper.keywords || []).map((keyword) => truncate(keyword, 100)).filter(Boolean).slice(0, 8),
    validated: true
  };
}
async function writeOutputs(papers, sourceStatus) {
  await mkdir(DATA_DIR, { recursive: true });
  const outputPapers = papers.map(compactPaperForOutput);
  const summary = buildSummary(outputPapers, sourceStatus);
  const payload = {
    generated_at: NOW.toISOString(),
    schema_version: 2,
    title: "遥感论文雷达",
    description: "多源开放学术记录聚合的遥感论文索引",
    ...summary,
    papers: outputPapers
  };
  const writes = [
    writeFile(OUTPUT_FILE, JSON.stringify(payload), "utf8"),
    writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2), "utf8"),
    writeFile(RSS_FILE, buildRss(outputPapers), "utf8"),
    writeFile(ROBOTS_FILE, `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`, "utf8"),
    writeFile(SITEMAP_FILE, buildSitemap(), "utf8")
  ];
  await Promise.all(writes);
  return summary;
}

async function main() {
  const startedAt = Date.now();
  const loaded = await readExisting();
  const forceInitial = process.env.ATLAS_FORCE_INITIAL === "1";
  const bootstrapThreshold = Number(process.env.ATLAS_BOOTSTRAP_THRESHOLD || 5000);
  const existing = forceInitial ? [] : loaded;
  const queryExistingCount = forceInitial || existing.length < bootstrapThreshold ? 0 : existing.length;
  log(`Existing index: ${existing.length.toLocaleString()} papers`);
  const sourceStatus = {};
  const collected = [];

  try {
    const manual = await loadManualImports(IMPORTS_DIR, { now: NOW, onError: (message) => log(`WARN 导入文件 ${message}`) });
    collected.push(...manual.papers);
    sourceStatus.ManualImports = { status: "ok", files: manual.files, fetched: manual.papers.length, errors: manual.errors.length };
    log(`ManualImports: loaded ${manual.papers.length.toLocaleString()} records from ${manual.files} file(s)`);
  } catch (error) {
    sourceStatus.ManualImports = { status: "error", files: 0, fetched: 0, message: error.message };
    log(`ERROR ManualImports: ${error.message}`);
  }

  const collectors = [];
  if (ENABLED_SOURCES.has("OpenAlex")) collectors.push(["OpenAlex", fetchOpenAlex(queryExistingCount)]);
  if (ENABLED_SOURCES.has("Crossref")) collectors.push(["Crossref", fetchCrossref(queryExistingCount)]);
  if (ENABLED_SOURCES.has("arXiv")) collectors.push(["arXiv", fetchArxiv()]);

  const settled = await Promise.allSettled(collectors.map(([, promise]) => promise));
  settled.forEach((result, index) => {
    const name = collectors[index][0];
    if (result.status === "fulfilled") {
      const records = result.value;
      collected.push(...records);
      sourceStatus[name] = { status: "ok", fetched: records.length };
      log(`${name}: collected ${records.length.toLocaleString()} records`);
    } else {
      sourceStatus[name] = { status: "error", fetched: 0, message: result.reason?.message || String(result.reason) };
      log(`ERROR ${name}: ${sourceStatus[name].message}`);
    }
  });

  if (!collected.length && existing.length) {
    log("No new records were collected; existing index will be preserved.");
  }

  const existingForMerge = existing.map((paper) => ({ ...paper, validated: true }));
  const deduped = deduplicate([...existingForMerge, ...collected]).slice(0, MAX_PAPERS);
  const summary = await writeOutputs(deduped, sourceStatus);
  log(`Wrote ${deduped.length.toLocaleString()} unique papers to ${path.relative(ROOT, OUTPUT_FILE)}`);
  log(`Topics: ${summary.topics.join(", ")}`);
  log(`Finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  if (!deduped.length) {
    throw new Error("The update produced zero papers; refusing to treat this as a successful update.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});