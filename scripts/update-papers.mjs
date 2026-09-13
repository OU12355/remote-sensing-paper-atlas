#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const OUTPUT_FILE = path.join(DATA_DIR, "papers.json");
const RSS_FILE = path.join(ROOT, "public", "feed.xml");
const SUMMARY_FILE = path.join(DATA_DIR, "summary.json");
const ROBOTS_FILE = path.join(ROOT, "public", "robots.txt");
const SITEMAP_FILE = path.join(ROOT, "public", "sitemap.xml");
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

const TOPIC_RULES = [
  { name: "SAR / InSAR", pattern: /synthetic aperture radar|\binsar\b|\bsar\b|interferometr|polarimetr|radar remote sensing/i },
  { name: "高光谱", pattern: /hyperspectral|imaging spectroscopy|spectral unmixing|spectral library/i },
  { name: "LiDAR / 点云", pattern: /\blidar\b|airborne laser|point cloud|laser scanning|photogrammetr/i },
  { name: "热红外", pattern: /thermal infrared|land surface temperature|\bthermal remote/i },
  { name: "大气遥感", pattern: /atmospheric remote|atmosphere|aerosol|cloud propert|trace gas|air quality/i },
  { name: "海洋与水体", pattern: /ocean color|ocean remote|sea surface|water quality|inland water|coastal water/i },
  { name: "植被与农业", pattern: /vegetation|forest|agricultur|crop|leaf area|phenolog|grassland|yield estim/i },
  { name: "土地与城市", pattern: /land cover|land use|urban|built-up|impervious|city mapping/i },
  { name: "变化检测", pattern: /change detection|change monitoring|time series analysis|multi-temporal|multitemporal/i },
  { name: "灾害与应急", pattern: /disaster|earthquake|landslide|wildfire|flood|drought|hurricane|emergency mapping/i },
  { name: "冰冻圈", pattern: /snow|glacier|ice sheet|sea ice|permafrost|cryosphere/i },
  { name: "土壤与地质", pattern: /soil|geolog|mineral mapping|rock|erosion|subsidence/i },
  { name: "目标检测与分割", pattern: /object detection|semantic segmentation|instance segmentation|scene classification|target recognition/i },
  { name: "基础模型与 AI", pattern: /foundation model|large language model|vision transformer|self-supervised|deep learning|machine learning|neural network/i },
  { name: "影像融合与重建", pattern: /image fusion|pan-sharpening|super-resolution|data fusion|image reconstruction|cloud removal/i },
  { name: "定标与反演", pattern: /calibration|radiometric|atmospheric correction|retrieval algorithm|inversion|reflectance/i },
  { name: "无人机遥感", pattern: /\buav\b|unmanned aerial|drone|airborne remote/i }
];

const ENABLED_SOURCES = new Set(String(process.env.ATLAS_SOURCES || "OpenAlex,Crossref,arXiv").split(",").map((value) => value.trim()).filter(Boolean));
const ACTIVE_QUERIES = QUERIES.slice(0, Math.max(1, Number(process.env.ATLAS_QUERY_LIMIT || QUERIES.length)));

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
    ...(paper.keywords || []),
    ...(paper.query_hits || [])
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  const strong = /remote sensing|earth observation|satellite remote|spaceborne remote|airborne remote|aerial remote|satellite imagery|satellite image|hyperspectral imag|multispectral imag|radar imagery|interferometric synthetic aperture radar/;
  const technique = /\bhyperspectral\b|\bmultispectral\b|synthetic aperture radar|\binsar\b|\blidar\b|photogrammetr|spectral unmixing|atmospheric correction|radiometric calibration|normalized difference vegetation index|\bndvi\b|ocean color remote|land surface temperature retriev/;
  const geospatial = /satellite|spaceborne|airborne|aerial|\buav\b|drone|earth|land|vegetation|crop|forest|ocean|water|soil|urban|atmosphere|glacier|snow|ice|surface|spatial|geospatial|mapping|monitoring|classification|retrieval|detection|imagery|imaging/;
  const sensor = /\bsentinel(?:-|\s)?\d|\blandsat\b|\bmodis\b|\bspot(?:-|\s)?\d|\bgaofen\b|worldview|rapideye|planet scope|terrasar|radarsat|alos|envisat|grace satellite/;
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
  const authors = (work.authorships || []).map((authorship) => ({
    name: cleanText(authorship.author?.display_name),
    orcid: authorship.author?.orcid || "",
    institution: cleanText(authorship.institutions?.[0]?.display_name)
  })).filter((author) => author.name);
  const sourceKeywords = [
    ...(work.topics || []).map((topic) => cleanText(topic.display_name)),
    ...(work.keywords || []).map((keyword) => cleanText(keyword.display_name))
  ].filter(Boolean);
  const id = doi ? `doi:${doi}` : stableId("openalex", work.id || title);
  return {
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
  };
}

async function fetchOpenAlex(existingCount) {
  const pageLimit = Number(process.env.ATLAS_OPENALEX_PAGES || (QUICK ? 1 : existingCount ? 1 : 2));
  const dateField = existingCount ? "from_created_date" : "from_publication_date";
  const fromDate = process.env.ATLAS_FROM_DATE || (existingCount ? dateDaysAgo(45) : dateDaysAgo(Number(process.env.ATLAS_INITIAL_DAYS || 3650)));
  log(`OpenAlex: querying ${ACTIVE_QUERIES.length} topics since ${fromDate} (${pageLimit} page(s) per topic)`);
  const records = await mapLimit(ACTIVE_QUERIES, Number(process.env.ATLAS_CONCURRENCY || 3), async (query) => {
    const found = [];
    let cursor = "*";
    for (let page = 0; page < pageLimit && cursor; page += 1) {
      const params = new URLSearchParams({
        search: query.q,
        filter: `${dateField}:${fromDate}`,
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
  return records;
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
    institution: cleanText(author.affiliation?.[0]?.name)
  })).filter((author) => author.name);
  const license = Array.isArray(item.license) ? item.license[0] : null;
  const links = Array.isArray(item.link) ? item.link : [];
  const pdfUrl = links.find((link) => /pdf/i.test(link["content-type"] || "") || /pdf/i.test(link.URL || ""))?.URL || "";
  const id = doi ? `doi:${doi}` : stableId("crossref", title + publishedDate);
  return {
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
  };
}

async function fetchCrossref(existingCount) {
  const pageLimit = Number(process.env.ATLAS_CROSSREF_PAGES || (QUICK ? 1 : existingCount ? 1 : 5));
  const dateField = existingCount ? "from-index-date" : "from-pub-date";
  const fromDate = process.env.ATLAS_FROM_DATE || (existingCount ? dateDaysAgo(60) : dateDaysAgo(Number(process.env.ATLAS_INITIAL_DAYS || 3650)));
  log(`Crossref: querying ${ACTIVE_QUERIES.length} topics since ${fromDate} (${pageLimit} page(s) per topic)`);
  return mapLimit(ACTIVE_QUERIES, Number(process.env.ATLAS_CONCURRENCY || 3), async (query) => {
    const found = [];
    let cursor = "*";
    for (let page = 0; page < pageLimit && cursor; page += 1) {
      const params = new URLSearchParams({
        "query.bibliographic": query.q,
        filter: `${dateField}:${fromDate},type:journal-article`,
        rows: "100",
        cursor,
        select: "DOI,title,author,abstract,URL,published,published-online,published-print,issued,created,container-title,short-container-title,type,subject,is-referenced-by-count,link,license,publisher",
        mailto: MAILTO
      });
      const payload = await fetchJson(`https://api.crossref.org/works?${params}`, `Crossref ${query.key} page ${page + 1}`, { retries: QUICK ? 1 : 2 });
      for (const item of payload.message?.items || []) {
        const paper = crossrefToPaper(item, query);
        if (paper) found.push(paper);
      }
      cursor = payload.message?.["next-cursor"] || "";
    }
    return found;
  });
}function xmlValue(xml, tag) {
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
    map.set(key, { ...previous, ...author, name, orcid: author?.orcid || previous.orcid || "", institution: author?.institution || previous.institution || "" });
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
  const mergedTopics = classifyTopics({
    ...base,
    title: preferText(base.title, incoming.title),
    abstract: preferText(base.abstract, incoming.abstract),
    keywords: mergeStringArrays(base.keywords || [], incoming.keywords || []),
    query_hits: mergeStringArrays(base.query_hits || [], incoming.query_hits || [])
  });
  return {
    ...base,
    title: preferText(base.title, incoming.title),
    abstract: preferText(base.abstract, incoming.abstract),
    authors: mergeAuthorArrays(base.authors || [], incoming.authors || []),
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
    keywords: mergeStringArrays(base.keywords || [], incoming.keywords || []).slice(0, 30),
    source: mergedSources.join(" + "),
    sources: mergedSources,
    topics: mergedTopics,
    query_hits: mergeStringArrays(base.query_hits || [], incoming.query_hits || []),
    indexed_at: incoming.indexed_at || base.indexed_at || NOW.toISOString()
  };
}

function deduplicate(papers) {
  const map = new Map();
  for (const raw of papers) {
    const paper = { ...raw, topics: classifyTopics(raw), sources: mergeStringArrays(raw.sources || [raw.source]) };
    if (paper.sources.length === 1 && paper.sources[0] === "Crossref" && !paper.pdf_url) paper.open_access = false;
    if (!paper.title || paper.title.length < 8 || !isValidPaperDate(paper.published_date) || !isRelevantPaper(paper)) continue;
    const key = paperKey(paper);
    if (map.has(key)) map.set(key, mergePaper(map.get(key), paper));
    else map.set(key, paper);
  }
  return [...map.values()].sort((a, b) => String(b.published_date || "").localeCompare(String(a.published_date || "")));
}function countBy(papers, selector) {
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
  const allSources = [...new Set(papers.flatMap((paper) => paper.sources || [paper.source]))].sort();
  return {
    generated_at: NOW.toISOString(),
    total: papers.length,
    open_access: papers.filter((paper) => paper.open_access).length,
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
    const description = paper.abstract || `${paper.venue || "遥感论文"} ${paper.doi ? `DOI: ${paper.doi}` : ""}`;
    return `    <item>\n      <title>${xmlEscape(paper.title)}</title>\n      <link>${xmlEscape(link)}</link>\n      <guid isPermaLink="false">${xmlEscape(paper.id)}</guid>\n      <pubDate>${new Date(`${paper.published_date || TODAY}T00:00:00Z`).toUTCString()}</pubDate>\n      <description>${xmlEscape(description)}</description>\n      <category>${xmlEscape((paper.topics || []).join(", "))}</category>\n    </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>遥感论文雷达</title>\n    <link>${xmlEscape(SITE_URL)}</link>\n    <description>持续更新的遥感论文聚合索引</description>\n    <language>zh-cn</language>\n    <lastBuildDate>${NOW.toUTCString()}</lastBuildDate>\n${items}\n  </channel>\n</rss>\n`;
}

function buildSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${xmlEscape(SITE_URL)}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`;
}

async function writeOutputs(papers, sourceStatus) {
  await mkdir(DATA_DIR, { recursive: true });
  const summary = buildSummary(papers, sourceStatus);
  const payload = {
    generated_at: NOW.toISOString(),
    schema_version: 1,
    title: "遥感论文雷达",
    description: "多源开放学术记录聚合的遥感论文索引",
    ...summary,
    papers
  };
  const writes = [
    writeFile(OUTPUT_FILE, JSON.stringify(payload), "utf8"),
    writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2), "utf8"),
    writeFile(RSS_FILE, buildRss(papers), "utf8"),
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

  const deduped = deduplicate([...existing, ...collected]).slice(0, MAX_PAPERS);
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