import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";
import "@citation-js/plugin-enw";
import { normalizePaperMetadata } from "./paper-utils.mjs";

const SUPPORTED_EXTENSIONS = new Set([".ris", ".bib", ".bibtex", ".enw"]);
const DEFAULT_MAX_FILE_MB = Number(process.env.ATLAS_IMPORT_MAX_FILE_MB || 20);

function textValue(value) {
  if (Array.isArray(value)) return textValue(value[0]);
  if (value && typeof value === "object") {
    return String(value.value || value.name || value.literal || "").replace(/\s+/g, " ").trim();
  }
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stringArray(value) {
  if (Array.isArray(value)) return [...new Set(value.map(textValue).filter(Boolean))];
  const text = textValue(value);
  return text ? [...new Set(text.split(/\s*[;,]\s*/).filter(Boolean))] : [];
}

function cslDate(item) {
  const parts = item.issued?.["date-parts"]?.[0] || item.published?.["date-parts"]?.[0];
  if (!parts?.length) return "";
  const [year, month = 1, day = 1] = parts;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cslAuthors(item) {
  return (Array.isArray(item.author) ? item.author : []).map((author) => ({
    name: textValue(author.literal || [author.given, author.family].filter(Boolean).join(" ")),
    institution: textValue(author.affiliation || author.institution)
  })).filter((author) => author.name);
}

function splitRecords(raw, startsWith) {
  return raw.split(new RegExp(`\\r?\\n(?=${startsWith})`, "i")).map((record) => record.trim()).filter(Boolean);
}

function extractRisAffiliations(raw) {
  return splitRecords(raw, "TY\\s{2}-").map((record) => [...record.matchAll(/^AD\s{2}-\s*(.+)$/gmi)].map((match) => textValue(match[1])));
}

function extractEnwAffiliations(raw) {
  const records = raw.split(/\r?\n(?=%0\s+)/).filter((record) => record.trim());
  return records.map((record) => [...record.matchAll(/^%(?:\+|Q)\s+(.+)$/gmi)].map((match) => textValue(match[1])));
}

function extractBibtexAffiliations(raw) {
  return raw.split(/(?=@\w+\s*\{)/i).filter((entry) => /^\s*@\w+/i.test(entry)).map((entry) => {
    const values = [];
    for (const field of ["affiliation", "institution", "address"]) {
      const match = entry.match(new RegExp(`${field}\\s*=\\s*(?:\\{([\\s\\S]*?)\\}|"([^"]*)")`, "i"));
      const value = textValue(match?.[1] || match?.[2]);
      if (value) values.push(value);
    }
    return values;
  });
}

function affiliationGroups(raw, extension) {
  if (extension === ".ris") return extractRisAffiliations(raw);
  if (extension === ".enw") return extractEnwAffiliations(raw);
  if (extension === ".bib" || extension === ".bibtex") return extractBibtexAffiliations(raw);
  return [];
}

export function detectImportSource(fileName = "", item = {}) {
  const haystack = [
    fileName,
    item.database,
    item.source,
    item.note,
    item.note?.map?.(textValue)?.join?.(" ")
  ].map(textValue).join(" ");
  if (/cnki|知网|中国知网/i.test(haystack)) return "CNKI";
  if (/wanfang|万方/i.test(haystack)) return "万方";
  return "手动导入";
}

function importedId(doi, title, publishedDate) {
  if (doi) return `doi:${doi}`;
  const hash = createHash("sha1").update(`${title}|${publishedDate}`).digest("hex").slice(0, 16);
  return `import:${hash}`;
}

export function cslToImportedPaper(item, options) {
  const { importSource, affiliations = [], now = new Date() } = options;
  const title = textValue(item.title || item["original-title"]);
  if (!title) return null;
  const publishedDate = cslDate(item);
  const doi = textValue(item.DOI || item.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase();
  const authors = cslAuthors(item);
  const joinedAffiliations = [...new Set(affiliations.map(textValue).filter(Boolean))];
  if (joinedAffiliations.length) {
    if (!authors.length) authors.push({ name: "机构作者", institution: joinedAffiliations.join("; ") });
    else authors[0].institution = [authors[0].institution, ...joinedAffiliations].filter(Boolean).join("; ");
  }
  const url = textValue(item.URL || item.url);
  const paper = {
    id: importedId(doi, title, publishedDate),
    title,
    abstract: textValue(item.abstract),
    authors,
    published_date: publishedDate,
    year: Number(publishedDate.slice(0, 4)) || null,
    venue: textValue(item["container-title"] || item["collection-title"] || item.journal),
    publisher: textValue(item.publisher),
    type: textValue(item.type || "article-journal") === "article-journal" ? "journal-article" : textValue(item.type),
    doi,
    url,
    pdf_url: /\.pdf(?:$|\?)/i.test(url) ? url : "",
    open_access: false,
    cited_by_count: 0,
    language: textValue(item.language),
    keywords: stringArray(item.keyword || item.keywords),
    source: importSource,
    sources: [importSource],
    import_source: importSource,
    query_hits: [`导入:${importSource}`],
    indexed_at: now.toISOString()
  };
  return normalizePaperMetadata(paper);
}

export async function loadManualImports(importsDir, options = {}) {
  const now = options.now || new Date();
  const maxFileBytes = Number(options.maxFileBytes || DEFAULT_MAX_FILE_MB * 1024 * 1024);
  const onError = options.onError || (() => {});
  let entries = [];
  try {
    entries = await readdir(importsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { papers: [], files: 0, errors: [] };
  }

  const papers = [];
  const errors = [];
  let files = 0;
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) continue;
    const filePath = path.join(importsDir, entry.name);
    try {
      const info = await stat(filePath);
      if (info.size > maxFileBytes) throw new Error(`文件超过 ${Math.round(maxFileBytes / 1024 / 1024)} MB 限制`);
      const raw = await readFile(filePath, "utf8");
      const cite = new Cite(raw);
      const groups = affiliationGroups(raw, extension);
      const importSource = detectImportSource(entry.name, cite.data?.[0] || {});
      cite.data.forEach((item, index) => {
        const paper = cslToImportedPaper(item, { importSource, affiliations: groups[index] || [], now });
        if (paper) papers.push(paper);
      });
      files += 1;
    } catch (error) {
      const message = `${entry.name}: ${error.message}`;
      errors.push(message);
      onError(message);
    }
  }
  return { papers, files, errors };
}