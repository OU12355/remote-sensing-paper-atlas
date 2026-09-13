import "./styles.css";

const app = document.querySelector("#app");
const PAGE_SIZE = 24;
const STORAGE_KEYS = {
  favorites: "rs-paper-atlas:favorites",
  theme: "rs-paper-atlas:theme"
};

const state = {
  data: null,
  papers: [],
  filtered: [],
  query: "",
  year: "全部",
  topic: "全部",
  source: "全部",
  openAccessOnly: false,
  domesticOnly: false,
  chineseOnly: false,
  favoritesOnly: false,
  sort: "latest",
  page: 1,
  favorites: new Set(readJson(STORAGE_KEYS.favorites, [])),
  expandedAbstracts: new Set()
};

const icons = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 19.5V6.5A2.5 2.5 0 0 1 6.5 4H20"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-1.2 3.4L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.1z"/><path d="m19 14-.8 2.2-2.2.8 2.2.8L19 20l.8-2.2 2.2-.8-2.2-.8zM5 13l-.8 2.2-2.2.8 2.2.8L5 19l.8-2.2 2.2-.8-2.2-.8z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.8L6 21z"/></svg>',
  quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17H4a1 1 0 0 1-1-1v-4a7 7 0 0 1 7-7M20 17h-3a1 1 0 0 1-1-1v-4a7 7 0 0 1 7-7"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 12h10M10 19h4"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>',
  radar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12 19 5"/><circle cx="19" cy="5" r="1.5"/></svg>'
};

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(value = "") {
  const safe = escapeHtml(value);
  const tokens = state.query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return safe;
  try {
    const pattern = tokens.map((token) => escapeRegex(escapeHtml(token))).join("|");
    return safe.replace(new RegExp(`(${pattern})`, "gi"), "<mark>$1</mark>");
  } catch {
    return safe;
  }
}
function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "日期未知";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function daysAgo(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00Z`).getTime();
  return Date.now() - date <= 7 * 86400000 && date <= Date.now() + 86400000;
}

function getInitialTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme);
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  const button = document.querySelector("#themeToggle");
  if (button) {
    button.innerHTML = theme === "dark" ? icons.sun : icons.moon;
    button.setAttribute("aria-label", theme === "dark" ? "切换为浅色主题" : "切换为深色主题");
  }
}

function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#top" aria-label="遥感论文雷达首页">
        <span class="brand-mark">${icons.radar}</span>
        <span><strong>遥感论文雷达</strong><small>REMOTE SENSING PAPER ATLAS</small></span>
      </a>
      <nav class="topnav" aria-label="主导航">
        <a href="#papers">论文库</a>
        <a href="#method">数据说明</a>
        <a href="./data/papers.json" download>下载数据</a>
      </nav>
      <button class="icon-button" id="themeToggle" type="button" aria-label="切换主题"></button>
    </header>

    <main id="top">
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow"><span></span>持续扫描全球遥感研究</div>
          <h1>让每一篇遥感论文<br /><em>都能被看见。</em></h1>
          <p>聚合 OpenAlex、Crossref、arXiv 以及 CNKI/万方人工导入题录，自动清洗、去重、识别国内研究并标注中文主题。每天增量更新，按关键词、年份、来源、国内研究和语言快速检索。</p>
          <div class="hero-actions">
            <a class="primary-button" href="#papers">开始检索 ${icons.arrow}</a>
            <a class="text-button" href="#method">了解收录范围</a>
          </div>
        </div>
        <div class="radar-panel" aria-hidden="true">
          <div class="radar-grid"></div>
          <div class="radar-sweep"></div>
          <div class="radar-ring ring-a"></div>
          <div class="radar-ring ring-b"></div>
          <div class="radar-dot dot-a"></div>
          <div class="radar-dot dot-b"></div>
          <div class="radar-dot dot-c"></div>
          <div class="radar-label label-a">SAR / InSAR</div>
          <div class="radar-label label-b">高光谱</div>
          <div class="radar-label label-c">地球观测</div>
          <div class="radar-center">RS</div>
        </div>
      </section>

      <section class="stats-strip" aria-label="索引统计">
        <article><span class="stat-icon">${icons.book}</span><div><strong id="statPapers">—</strong><span>已索引论文</span></div></article>
        <article><span class="stat-icon">${icons.spark}</span><div><strong id="statRecent">—</strong><span>近 7 天发表</span></div></article>
        <article><span class="stat-icon">${icons.radar}</span><div><strong id="statOpen">—</strong><span>开放获取</span></div></article>
        <article><span class="stat-icon">${icons.check}</span><div><strong id="statDomestic">—</strong><span>国内研究</span></div></article>
        <article><span class="stat-icon">${icons.calendar}</span><div><strong id="statUpdated">—</strong><span>最近更新</span></div></article>
      </section>

      <section class="library" id="papers">
        <div class="section-heading">
          <div><span class="section-kicker">LITERATURE EXPLORER</span><h2>遥感论文库</h2></div>
          <p id="resultSummary" aria-live="polite"></p>
        </div>
        <div class="search-shell">
          <label class="search-box" for="searchInput">
            ${icons.search}
            <input id="searchInput" type="search" autocomplete="off" placeholder="搜索标题、作者、摘要、期刊或研究主题…" />
            <kbd>/</kbd>
          </label>
          <button class="filter-toggle" id="filterToggle" type="button">${icons.filter}<span>筛选</span></button>
        </div>
        <div class="filter-panel" id="filterPanel">
          <div class="filter-row"><span class="filter-label">研究方向</span><div class="filter-options" id="topicFilters"></div></div>
          <div class="filter-grid">
            <label class="select-field"><span>发表年份</span><select id="yearFilter"></select></label>
            <label class="select-field"><span>索引来源</span><select id="sourceFilter"></select></label>
            <label class="select-field"><span>排序方式</span><select id="sortFilter"><option value="latest">最新发表</option><option value="cited">引用最多</option><option value="relevance">相关度优先</option><option value="title">标题排序</option></select></label>
            <div class="toggle-fields">
              <label class="check-field"><input id="oaFilter" type="checkbox" /><span>${icons.check}</span>仅开放获取</label>
              <label class="check-field"><input id="domesticFilter" type="checkbox" /><span>${icons.check}</span>仅国内研究</label>
              <label class="check-field"><input id="chineseFilter" type="checkbox" /><span>${icons.check}</span>仅中文论文</label>
              <label class="check-field"><input id="favoriteFilter" type="checkbox" /><span>${icons.check}</span>仅我的收藏</label>
            </div>
          </div>
          <div class="filter-footer"><button type="button" class="reset-button" id="resetFilters">清除筛选</button><span id="activeFilterText"></span></div>
        </div>
        <div id="paperGrid" class="paper-grid">
          <div class="loading-state">
            <div class="loading-radar"></div>
            <h3>正在同步论文索引</h3>
            <p>首次访问需要加载开放论文数据，完成后浏览器会缓存，后续检索会明显更快。</p>
          </div>
        </div>
        <div id="emptyState" class="empty-state" hidden>
          <div>${icons.search}</div><h3>没有找到匹配论文</h3><p>尝试减少关键词、清除筛选，或使用更宽泛的英文检索词。</p><button type="button" id="emptyReset">清除全部条件</button>
        </div>
        <div class="load-more-wrap"><button type="button" class="load-more" id="loadMore">加载更多</button></div>
      </section>

      <section class="method" id="method">
        <div class="method-intro">
          <span class="section-kicker">OPEN & TRACEABLE</span><h2>数据如何更新？</h2>
          <p>站点采用静态数据架构。更新任务每天从开放学术 API 拉取新增记录，并合并 imports 目录中的 CNKI、万方和 EndNote 导出题录；按 DOI 或“标准化标题 + 年份”去重，统一作者、摘要、国内机构与引用信息。</p>
        </div>
        <div class="method-grid">
          <article><span>01</span><h3>多源采集</h3><p>OpenAlex 提供全球与中国机构图谱，Crossref 补充国内期刊题录，arXiv 覆盖预印本，CNKI/万方文件按需导入。</p></article>
          <article><span>02</span><h3>清洗去重</h3><p>剔除无效题录，规范 DOI 与日期，合并重复记录，恢复可公开获取的摘要。</p></article>
          <article><span>03</span><h3>每日发布</h3><p>GitHub Actions 每天自动运行，更新论文 JSON、RSS 与网页，并发布到 GitHub Pages。</p></article>
        </div>
        <div class="scope-note">
          <strong>关于“全部论文”</strong>
          <p>任何开放聚合站都无法直接覆盖 Scopus、Web of Science、IEEE Xplore、Elsevier 等全部受版权或密钥保护的记录。本项目持续扩大开放来源覆盖；对未开放索引的论文，会保留 DOI 跳转入口。正式部署时可增加机构订阅 API、CNKI/万方授权或本地数据库。</p>
        </div>
      </section>
    </main>
    <footer>
      <div class="brand compact"><span class="brand-mark">${icons.radar}</span><strong>遥感论文雷达</strong></div>
      <p>开放学术数据聚合工具，仅供科研检索与追踪。论文版权归原作者及出版机构所有。</p>
      <a href="#top">返回顶部 ↑</a>
    </footer>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  `;
  applyTheme(getInitialTheme());
}

async function fetchPaperData(url) {
  if (!("caches" in window)) return fetch(url, { cache: "no-cache" });
  const cache = await caches.open("rs-paper-atlas-data-v2");
  const cached = await cache.match(url);
  if (cached) {
    fetch(url, { cache: "no-cache" })
      .then((fresh) => { if (fresh.ok) return cache.put(url, fresh.clone()); })
      .catch(() => {});
    return cached;
  }
  const response = await fetch(url, { cache: "no-cache" });
  if (response.ok) await cache.put(url, response.clone());
  return response;
}

async function loadData() {
  try {
    const response = await fetchPaperData(new URL("data/papers.json", document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    state.papers = Array.isArray(state.data.papers) ? state.data.papers : [];
    renderStats();
    renderFilterOptions();
    applyFilters();
  } catch (error) {
    document.querySelector("#paperGrid").innerHTML = `<div class="load-error"><h2>论文数据暂时无法加载</h2><p>请检查 <code>public/data/papers.json</code> 是否存在，或重新运行 <code>npm run update</code>。</p><small>${escapeHtml(error.message)}</small></div>`;
  }
}

function renderStats() {
  const total = state.papers.length;
  const recent = state.papers.filter((paper) => daysAgo(paper.published_date)).length;
  const open = total ? Math.round((state.papers.filter((paper) => paper.open_access).length / total) * 100) : 0;
  const generatedAt = state.data.generated_at ? new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(state.data.generated_at)) : "—";
  document.querySelector("#statPapers").textContent = formatNumber(total);
  document.querySelector("#statRecent").textContent = formatNumber(recent);
  document.querySelector("#statOpen").textContent = `${open}%`;
  document.querySelector("#statDomestic").textContent = formatNumber(state.data.domestic_count ?? state.papers.filter((paper) => paper.is_domestic).length);
  document.querySelector("#statUpdated").textContent = generatedAt;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function renderFilterOptions() {
  const topics = state.data.topics?.length ? state.data.topics : uniqueSorted(state.papers.flatMap((paper) => paper.topics || []));
  const years = uniqueSorted(state.papers.map((paper) => String(paper.year || "")).filter((year) => /^\d{4}$/.test(year))).reverse();
  const sources = uniqueSorted(state.papers.flatMap((paper) => paper.sources || [paper.source]).filter(Boolean));
  document.querySelector("#topicFilters").innerHTML = ["全部", ...topics].map((topic) => `<button type="button" data-filter-type="topic" data-value="${escapeHtml(topic)}" class="${topic === "全部" ? "active" : ""}">${escapeHtml(topic)}</button>`).join("");
  document.querySelector("#yearFilter").innerHTML = ["全部", ...years].map((year) => `<option value="${escapeHtml(year)}">${year === "全部" ? "全部年份" : `${year} 年`}</option>`).join("");
  document.querySelector("#sourceFilter").innerHTML = ["全部", ...sources].map((source) => `<option value="${escapeHtml(source)}">${source === "全部" ? "全部来源" : escapeHtml(source)}</option>`).join("");
}

function renderActiveFilters() {
  const filters = [];
  if (state.query) filters.push(`关键词：${state.query}`);
  if (state.year !== "全部") filters.push(state.year);
  if (state.topic !== "全部") filters.push(state.topic);
  if (state.source !== "全部") filters.push(state.source);
  if (state.openAccessOnly) filters.push("开放获取");
  if (state.domesticOnly) filters.push("国内研究");
  if (state.chineseOnly) filters.push("中文论文");
  if (state.favoritesOnly) filters.push("我的收藏");
  document.querySelector("#activeFilterText").textContent = filters.length ? `当前：${filters.join(" · ")}` : "未启用筛选条件";
}

function relevanceScore(paper) {
  const query = state.query.trim().toLocaleLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  const title = String(paper.title || "").toLocaleLowerCase();
  const authors = (paper.authors || []).map((author) => author.name || author).join(" ").toLocaleLowerCase();
  const topics = (paper.topics || []).join(" ").toLocaleLowerCase();
  const abstract = String(paper.abstract || "").toLocaleLowerCase();
  return tokens.reduce((score, token) => {
    let next = score;
    if (title === token) next += 100;
    if (title.includes(token)) next += 40;
    if (topics.includes(token)) next += 20;
    if (authors.includes(token)) next += 12;
    if (abstract.includes(token)) next += 5;
    return next;
  }, 0);
}
function applyFilters() {
  const query = state.query.trim().toLocaleLowerCase();
  const queryTokens = query.split(/\s+/).filter(Boolean);
  state.filtered = state.papers.filter((paper) => {
    if (state.year !== "全部" && String(paper.year) !== state.year) return false;
    if (state.topic !== "全部" && !(paper.topics || []).includes(state.topic)) return false;
    if (state.source !== "全部" && !(paper.sources || [paper.source]).includes(state.source)) return false;
    if (state.openAccessOnly && !paper.open_access) return false;
    if (state.domesticOnly && !paper.is_domestic) return false;
    if (state.chineseOnly && paper.language !== "zh") return false;
    if (state.favoritesOnly && !state.favorites.has(paper.id)) return false;
    if (queryTokens.length) {
      const haystack = [paper.title, paper.abstract, paper.venue, paper.publisher, ...(paper.keywords || []), ...(paper.topics || []), ...(paper.authors || []).map((author) => author.name || author)].filter(Boolean).join(" ").toLocaleLowerCase();
      if (!queryTokens.every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
  state.filtered.sort((a, b) => {
    if (state.sort === "cited") return (b.cited_by_count || 0) - (a.cited_by_count || 0);
    if (state.sort === "title") return String(a.title || "").localeCompare(String(b.title || ""), "en");
    if (state.sort === "relevance" && query) return relevanceScore(b) - relevanceScore(a) || String(b.published_date || "").localeCompare(String(a.published_date || ""));
    return String(b.published_date || "").localeCompare(String(a.published_date || ""));
  });
  state.page = 1;
  renderResults();
  renderActiveFilters();
}
function truncateAuthors(authors = []) {
  const names = authors.map((author) => author.name || author).filter(Boolean);
  if (!names.length) return "作者信息暂缺";
  if (names.length <= 5) return names.join(" · ");
  return `${names.slice(0, 5).join(" · ")} 等 ${names.length} 位作者`;
}

function paperCard(paper, index) {
  const abstract = String(paper.abstract || "").trim();
  const abstractExpanded = state.expandedAbstracts.has(paper.id);
  const displayAbstract = abstract || "该来源未提供公开摘要，可前往原文页面查看。";
  const topics = (paper.topics || []).slice(0, 4);
  const isFavorite = state.favorites.has(paper.id);
  const primaryUrl = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : "");
  const pdfUrl = paper.pdf_url || "";
  return `
    <article class="paper-card ${daysAgo(paper.published_date) ? "is-new" : ""}" style="--delay:${Math.min(index, 10) * 35}ms">
      <div class="paper-topline">
        <div class="badges">${daysAgo(paper.published_date) ? '<span class="badge new">NEW</span>' : ""}${paper.is_domestic ? '<span class="badge cn">CN</span>' : ""}${paper.language === "zh" ? '<span class="badge zh">中文</span>' : ""}${paper.open_access ? '<span class="badge oa">OPEN</span>' : ""}<span class="badge source">${escapeHtml((paper.sources || [paper.source]).slice(0, 2).join(" + "))}</span></div>
        <button class="favorite-button ${isFavorite ? "active" : ""}" type="button" data-action="favorite" data-id="${escapeHtml(paper.id)}" aria-label="${isFavorite ? "取消收藏" : "收藏论文"}">${icons.bookmark}</button>
      </div>
      <h3>${highlight(paper.title || "未命名论文")}</h3>
      <p class="authors">${escapeHtml(truncateAuthors(paper.authors))}</p>
      <div class="paper-meta"><span>${icons.calendar}${escapeHtml(formatDate(paper.published_date))}</span><span>${icons.quote}${formatNumber(paper.cited_by_count)} 次引用</span></div>
      <div class="venue"><span>${icons.book}</span><p>${escapeHtml(paper.venue || paper.publisher || "来源期刊/会议信息暂缺")}</p></div>
      <p class="abstract ${abstractExpanded ? "expanded" : ""}">${highlight(displayAbstract)}</p>
      ${abstract && abstract.length > 170 ? `<button class="abstract-toggle" type="button" data-action="abstract" data-id="${escapeHtml(paper.id)}">${abstractExpanded ? "收起摘要" : "展开摘要"} ${icons.chevron}</button>` : ""}
      <div class="topics">${topics.map((topic) => `<button type="button" data-filter-type="topic" data-value="${escapeHtml(topic)}">${escapeHtml(topic)}</button>`).join("")}</div>
      <div class="paper-actions">
        ${primaryUrl ? `<a class="read-link" href="${escapeHtml(primaryUrl)}" target="_blank" rel="noopener noreferrer">阅读原文 ${icons.external}</a>` : "<span></span>"}
        <div class="mini-actions">${pdfUrl ? `<a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener noreferrer">PDF</a>` : ""}${paper.doi ? `<button type="button" data-action="copy-doi" data-id="${escapeHtml(paper.id)}">DOI</button>` : ""}<button type="button" data-action="cite" data-id="${escapeHtml(paper.id)}">BibTeX</button></div>
      </div>
    </article>`;
}

function renderResults() {
  const grid = document.querySelector("#paperGrid");
  const empty = document.querySelector("#emptyState");
  const loadMore = document.querySelector("#loadMore");
  const shown = state.filtered.slice(0, state.page * PAGE_SIZE);
  document.querySelector("#resultSummary").textContent = `找到 ${formatNumber(state.filtered.length)} 篇 · 当前显示 ${formatNumber(shown.length)} 篇`;
  if (!shown.length) {
    grid.innerHTML = "";
    empty.hidden = false;
    loadMore.hidden = true;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = shown.map(paperCard).join("");
  loadMore.hidden = shown.length >= state.filtered.length;
  loadMore.textContent = `加载更多（剩余 ${formatNumber(state.filtered.length - shown.length)} 篇）`;
}

function toBibtex(paper) {
  const authors = (paper.authors || []).map((author) => author.name || author).filter(Boolean).join(" and ");
  const clean = (value = "") => String(value).replace(/[{}]/g, "");
  const keyBase = (paper.authors?.[0]?.name || paper.title || "paper").split(/\s+/).at(-1).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "");
  const key = `${keyBase}${paper.year || ""}`;
  return `@article{${key || "remoteSensingPaper"},\n  title = {${clean(paper.title)}},\n  author = {${clean(authors)}},\n  journal = {${clean(paper.venue || paper.publisher)}},\n  year = {${paper.year || ""}},\n  doi = {${clean(paper.doi)}},\n  url = {${clean(paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : ""))}}\n}`;
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showToast(message);
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function resetAll() {
  state.query = "";
  state.year = "全部";
  state.topic = "全部";
  state.source = "全部";
  state.openAccessOnly = false;
  state.domesticOnly = false;
  state.chineseOnly = false;
  state.favoritesOnly = false;
  state.sort = "latest";
  document.querySelector("#searchInput").value = "";
  document.querySelector("#yearFilter").value = "全部";
  document.querySelector("#sourceFilter").value = "全部";
  document.querySelector("#sortFilter").value = "latest";
  document.querySelector("#oaFilter").checked = false;
  document.querySelector("#domesticFilter").checked = false;
  document.querySelector("#chineseFilter").checked = false;
  document.querySelector("#favoriteFilter").checked = false;
  document.querySelectorAll("[data-filter-type=topic]").forEach((button) => button.classList.toggle("active", button.dataset.value === "全部"));
  applyFilters();
}

function bindEvents() {
  document.querySelector("#themeToggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  let searchTimer;
  document.querySelector("#searchInput").addEventListener("input", (event) => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { state.query = event.target.value; applyFilters(); }, 160);
  });
  document.querySelector("#filterToggle").addEventListener("click", () => document.querySelector("#filterPanel").classList.toggle("mobile-open"));
  document.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-filter-type]");
    if (filter) {
      const type = filter.dataset.filterType;
      state[type] = filter.dataset.value;
      if (type === "topic") document.querySelectorAll("[data-filter-type=topic]").forEach((button) => button.classList.toggle("active", button === filter));
      applyFilters();
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const paper = state.papers.find((item) => item.id === action.dataset.id);
    if (!paper) return;
    if (action.dataset.action === "favorite") {
      if (state.favorites.has(paper.id)) state.favorites.delete(paper.id); else state.favorites.add(paper.id);
      localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...state.favorites]));
      if (state.favoritesOnly) applyFilters(); else renderResults();
      showToast(state.favorites.has(paper.id) ? "已加入收藏" : "已取消收藏");
    }
    if (action.dataset.action === "abstract") {
      if (state.expandedAbstracts.has(paper.id)) state.expandedAbstracts.delete(paper.id); else state.expandedAbstracts.add(paper.id);
      renderResults();
    }
    if (action.dataset.action === "copy-doi") copyText(paper.doi, "DOI 已复制");
    if (action.dataset.action === "cite") copyText(toBibtex(paper), "BibTeX 已复制");
  });
  document.querySelector("#yearFilter").addEventListener("change", (event) => { state.year = event.target.value; applyFilters(); });
  document.querySelector("#sourceFilter").addEventListener("change", (event) => { state.source = event.target.value; applyFilters(); });
  document.querySelector("#sortFilter").addEventListener("change", (event) => { state.sort = event.target.value; applyFilters(); });
  document.querySelector("#oaFilter").addEventListener("change", (event) => { state.openAccessOnly = event.target.checked; applyFilters(); });
  document.querySelector("#domesticFilter").addEventListener("change", (event) => { state.domesticOnly = event.target.checked; applyFilters(); });
  document.querySelector("#chineseFilter").addEventListener("change", (event) => { state.chineseOnly = event.target.checked; applyFilters(); });
  document.querySelector("#favoriteFilter").addEventListener("change", (event) => { state.favoritesOnly = event.target.checked; applyFilters(); });
  document.querySelector("#resetFilters").addEventListener("click", resetAll);
  document.querySelector("#emptyReset").addEventListener("click", resetAll);
  document.querySelector("#loadMore").addEventListener("click", () => { state.page += 1; renderResults(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      document.querySelector("#searchInput").focus();
    }
    if (event.key === "Escape") document.querySelector("#filterPanel").classList.remove("mobile-open");
  });
}

renderShell();
bindEvents();
loadData();