const CHINESE_CHARACTER = /[\u3400-\u9fff]/g;
const CHINESE_INSTITUTION = /(?:大学|学院|研究院|研究所|科学院|测绘院|勘测院|气象局|自然资源部|实验室|研究中心|遥感中心|地理所)/;
const CHINA_AFFILIATION = /(?:^|[,\s;(])cn(?:$|[,\s;)]|china|中国|中华人民共和国)/i;

function cleanValue(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function authorInstitutionText(author) {
  if (!author || typeof author !== "object") return "";
  return [
    author.institution,
    author.affiliation,
    author.organization,
    ...(Array.isArray(author.institutions) ? author.institutions : [])
  ].map((value) => cleanValue(typeof value === "object" ? value?.name : value)).filter(Boolean).join(" ");
}

export function normalizeCountryCode(value) {
  const code = cleanValue(value).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

export function getAuthorCountryCodes(author) {
  if (!author || typeof author !== "object") return [];
  const codes = [
    author.country_code,
    ...(Array.isArray(author.country_codes) ? author.country_codes : []),
    ...(Array.isArray(author.institutions) ? author.institutions.map((institution) => institution?.country_code) : [])
  ].map(normalizeCountryCode).filter(Boolean);
  return [...new Set(codes)];
}

export function detectLanguage(rawLanguage, ...texts) {
  const raw = cleanValue(rawLanguage).toLowerCase();
  const text = texts.map(cleanValue).filter(Boolean).join(" ");
  const cjkCount = (text.match(CHINESE_CHARACTER) || []).length;
  const latinCount = (text.match(/[a-z]/gi) || []).length;
  if (/^(?:ja|jpn|japanese)(?:[-_].*)?$/i.test(raw)) return "ja";
  if (cjkCount >= 3 && cjkCount >= latinCount * 0.15) return "zh";
  if (text && latinCount >= 3) return "en";
  if (/^(?:zh|zho|chi|chinese)(?:[-_].*)?$/i.test(raw)) return "zh";
  if (/^(?:en|eng|english)(?:[-_].*)?$/i.test(raw)) return "en";
  if (raw) return raw.split(/[-_]/)[0].slice(0, 12);
  return "unknown";
}
export function inferDomestic(authors = [], previous = false) {
  const countryCodes = [...new Set(authors.flatMap(getAuthorCountryCodes))];
  const affiliationText = authors.map(authorInstitutionText).filter(Boolean).join(" ");
  const explicitCountry = countryCodes.includes("CN");
  const explicitName = CHINA_AFFILIATION.test(affiliationText) || CHINESE_INSTITUTION.test(affiliationText);
  const isDomestic = explicitCountry || explicitName || Boolean(previous);
  return {
    is_domestic: isDomestic,
    domestic_evidence: isDomestic ? "affiliation" : "unknown",
    author_country_codes: countryCodes
  };
}

export function normalizePaperMetadata(paper = {}) {
  const domestic = inferDomestic(paper.authors || [], paper.is_domestic === true);
  return {
    ...paper,
    language: detectLanguage(paper.language, paper.title, paper.abstract, ...(paper.keywords || [])),
    is_domestic: domestic.is_domestic,
    domestic_evidence: domestic.domestic_evidence
  };
}

export function isChinesePaper(paper = {}) {
  return normalizePaperMetadata(paper).language === "zh";
}

export function mergeImportSource(current, incoming) {
  const values = [current, incoming].flatMap((value) => Array.isArray(value) ? value : [value]).map(cleanValue).filter(Boolean);
  return [...new Set(values)];
}