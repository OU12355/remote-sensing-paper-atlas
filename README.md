# 遥感论文雷达

一个可持续更新、可公开部署的遥感论文聚合网站。站点从 OpenAlex、Crossref 和 arXiv 抓取开放学术元数据，并支持合并 CNKI、万方和其他合法来源的 RIS/BibTeX/EndNote 导出题录；自动清洗、去重、分类，并提供国内研究、中文论文、来源和主题筛选。

## 当前能力

- 多源采集：OpenAlex 学术图谱、Crossref 出版记录、arXiv 预印本，以及 CNKI/万方人工导入。
- 自动去重：按“标准化标题 + 年份”合并预印本、期刊版和重复记录。
- 相关性过滤：剔除仅概念相近、但不属于遥感研究的记录。
- 自动分类：SAR/InSAR、高光谱、LiDAR/点云、大气、海洋、农业、灾害、基础模型等主题。
- 国内覆盖：按作者机构 `CN` 标记中国大陆研究，支持中文查询与国内期刊 ISSN 补录。
- 前端功能：中英文组合检索、国内/中文/年份/来源/开放获取筛选、收藏、排序、BibTeX 和 DOI 复制。
- 发布产物：网页、论文 JSON、统计摘要、RSS、robots.txt 和 sitemap.xml。
- 定时更新：GitHub Actions 每天 03:17 UTC 自动抓取、构建和部署。

## 本地运行

```powershell
npm install
npm run update
npm run dev
```

浏览器访问终端显示的本地网址，通常是 `http://localhost:5173`。

只做一次快速增量更新：

```powershell
npm run update:quick
```

强制重建近十年的基础库：

```powershell
$env:ATLAS_FORCE_INITIAL='1'
npm run update
```

## 发布为公开网址

1. 在 GitHub 新建一个仓库，例如 `remote-sensing-paper-atlas`。
2. 将本目录推送到仓库的 `main` 分支。
3. 打开仓库 `Settings -> Pages`，将 Source 设为 `GitHub Actions`。
4. 打开 `Actions -> Update papers and deploy`，点击 `Run workflow`。
5. 首次成功运行后，网址通常是：
   `https://你的用户名.github.io/remote-sensing-paper-atlas/`

如果 `actions/configure-pages` 无法自动启用 GitHub Pages，手动执行第 3 步即可。

## 更新机制

`scripts/update-papers.mjs` 负责完整数据管线。每天运行时：

1. 从已有 `public/data/papers.json` 读取历史索引。
2. 合并 `imports/` 中的 RIS、BibTeX、EndNote 题录，并请求 OpenAlex、Crossref 和 arXiv。
3. 恢复 OpenAlex 摘要、规范 DOI/日期、清理 JATS HTML。
4. 识别作者机构国别、恢复中文语言信息，并执行相关性判定和标题/年份去重。
5. 生成完整 JSON、摘要、RSS、robots 与 sitemap。
6. 构建 Vite 静态站点并发布到 GitHub Pages。
7. 将更新数据提交回仓库，供下一次增量抓取使用。

若某一天某个数据源失败，任务会保留其他来源和既有数据，不会用空数据覆盖网站。待索引少于 5,000 篇时，任务会继续执行基础库回填。

## 可配置环境变量

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `ATLAS_MAILTO` | 示例邮箱 | API 礼貌标识，公开部署时应改成真实联系邮箱 |
| `ATLAS_SITE_URL` | GitHub Pages 地址 | sitemap、robots、RSS 使用的正式网址 |
| `ATLAS_SOURCES` | `OpenAlex,Crossref,arXiv` | 只运行指定来源 |
| `ATLAS_QUERY_LIMIT` | 全部 | 限制主题查询数量，便于测试 |
| `ATLAS_FROM_DATE` | 按任务自动计算 | 指定抓取起始日期，如 `2016-01-01` |
| `ATLAS_OPENALEX_PAGES` | 初次 2 页，增量 1 页 | OpenAlex 每个主题抓取页数 |
| `ATLAS_CROSSREF_PAGES` | 初次 5 页，增量 1 页 | Crossref 每个主题抓取页数 |
| `ATLAS_CHINESE_QUERY_LIMIT` | `9` | 中文 Crossref 查询主题数 |
| `ATLAS_JOURNAL_PAGES` | 初次 10 页，增量 1 页 | 国内期刊 ISSN 补录页数 |
| `ATLAS_DOMESTIC_QUERIES` | `6` | OpenAlex 中国机构定向查询数 |
| `ATLAS_DOMESTIC_PAGES` | `1` | 每个国内机构查询的页数 |
| `ATLAS_ARXIV_QUERIES` | 初次 14，快速 3 | arXiv 查询主题数 |
| `ATLAS_MAX_PAPERS` | `100000` | 索引上限 |
| `ATLAS_BOOTSTRAP_THRESHOLD` | `5000` | 低于该数量时继续基础库回填 |

示例：只更新 Crossref：

```powershell
$env:ATLAS_SOURCES='Crossref'
npm run update
```

## 目录结构

```text
.
├── .github/workflows/update-and-deploy.yml  # 每日更新与 Pages 发布
├── public/
│   ├── data/papers.json                     # 网站使用的完整论文索引
│   ├── data/summary.json                    # 公开统计摘要
│   └── feed.xml                             # RSS
├── imports/                                 # CNKI/万方 RIS、BibTeX、EndNote 导入目录
├── scripts/update-papers.mjs                # 抓取、清洗、去重与生成脚本
├── src/                                     # 网站前端
└── vite.config.js
```

## 收录边界

“所有遥感论文”无法由任何单一公开 API 完整覆盖。Scopus、Web of Science、IEEE Xplore、Elsevier ScienceDirect、CNKI 和万方等平台通常要求机构订阅或专用 API 密钥。当前站点聚合开放来源，并通过 `imports/` 合并用户有权使用的题录导出；不会抓取 CNKI/万方网页或绕过登录、验证码和反爬机制。

后续可按机构权限增加以下适配器：

- IEEE Xplore Metadata API：需要机构 API key。
- Elsevier Scopus API：需要机构 API key。
- Web of Science Starter/Expanded API：需要 Clarivate key。
- CNKI / 万方：已支持合规题录导入；全自动同步仍需要授权数据导出或机构 API。
- Semantic Scholar / CORE / BASE：可进一步补充开放获取全文与预印本覆盖。

## 数据与版权

本仓库代码用于科研检索。论文题录、摘要和链接来自各自的开放数据源；论文版权归原作者和出版机构所有。正式公开服务应符合各 API 的使用条款，并正确保留来源标识。