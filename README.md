# iptv-sources-build

独立构建 [`whyun-pages/iptv-sources@main`](https://github.com/whyun-pages/iptv-sources)，不调用源仓库 Actions，不向源仓库提交，不生成保活空提交。每次检出最新 main，实际 SHA 写入 Actions Summary。

## 已配置

- GitHub Actions cron `17 */2 * * *`（UTC；北京时间每天偶数小时的第 17 分钟），以及手动触发。
- Node.js 24、pnpm 11、冻结 lockfile 安装，`pnpm build`、`pnpm m3u`、`pnpm static`。
- 每次清空旧产物；生成器可能吞异常，因此额外验证新鲜 channels.json、有效 M3U、合并源/TXT、静态首页、TVBox JSON 及非空 lives（结构、TXT 引用和至少一个非空列表）、四个 EPG 的当天中国日期节目及 25 MiB 单文件上限。任何检查失败都不发布，保持线上版本。
- 有意采用严格检查：任何必需 EPG/TVBox 上游故障都阻断部署，而不是发布部分数据。此检查不保证全部频道可播放，也不是完整 XML schema 校验。
- 构建产物保留 3 天，构建日志保留 7 天；并发串行，不取消正在执行的部署。
- Cloudflare 凭据仅传给独立部署 job，不传给源代码构建或安装依赖。

## 首次使用：先仅构建

Actions → **Build IPTV sources** → **Run workflow**，保持 `deploy` 未勾选。下载 `pages-output` 检查结果；未配置定时发布开关时，自动调度只构建，不影响线上。手动勾选 `deploy` 可进行单次发布，不会开启后续定时发布。

## 配置现有 Cloudflare Pages

在此仓库 **Settings → Secrets and variables → Actions** 配置；源仓库 secrets 不会自动继承，也不能读取复制。

Secrets：
- `CLOUDFLARE_API_TOKEN`：受限于目标账号的 **Account / Cloudflare Pages / Edit** token。不要把 token 写入仓库或聊天。
- `CLOUDFLARE_ACCOUNT_ID`：现有 Pages 项目所在账号。

Variables：
- `PROJECT_NAME`：从 Cloudflare 控制台确认的**现有** Pages 项目名（也兼容同名 secret）。不能用 GitHub 仓库名猜测。
- `CF_PAGES_BRANCH`：该项目当前的 production branch，必须准确匹配。
- `CUSTOM_URL`：现有 Pages 的 HTTPS 正式域名，例如经确认的 `https://your-project.pages.dev`，不要末尾斜杠。会用于生成频道/EPG链接。
- `DEPLOY_ENABLED`：仅控制定时发布。首次验证时保持未设置或 `false`，在 main 手动运行并勾选 `deploy`，即可单次发布；确认成功后再设为 `true`，之后定时构建通过检查会自动发布。手动发布不依赖此变量，但仍须配置所有 Cloudflare 参数并通过目标与产物校验。
- 可选：`IPTV_PROXY_IP_RANGES`、`IPTV_PROXY_PORT`，按原构建配置复制。`CLOSE_SOURCE_PROXY=true` 已保留。

发布前读取 Cloudflare API，核实项目确实存在、生产分支匹配、CUSTOM_URL 属于该项目；未配置或核对失败则停止，不创建项目。随后用 Wrangler 4 Direct Upload 发布，部署链接在 Actions Summary。无需改动源仓库。

若原 Cloudflare Git 自动构建仍运行，它与此工作流不共享并发锁，可能覆盖彼此部署。启用新发布前决定是否关闭原自动构建；本仓库不会擅自更改它。

## 限制与排查

- GitHub cron 不保证准时；新独立公共仓库仍可能受 60 天无仓库活动自动停用 schedule 的规则影响。这不是永久保活方案。Actions 页面检查停用状态，必要时重新启用；如需避免该调度依赖，再接入外部定时器。
- 未启用 `push` 自动触发，修改配置不会自动发布。手动运行用于验收。
- 冻结安装失败请先在源仓库修正 package.json / lockfile 一致性，不在此仓库绕过锁文件。
- 构建成功不代表部署成功：查看 deploy job 是否跳过以及配置核验结果。
- 本地校验器测试：`node --test scripts/*.test.mjs`。

[Cloudflare Direct Upload CI 文档](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
