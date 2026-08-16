# dsh-wx-archive

[DSH](https://github.com/deepseek-ai/deepseek-harness)（DeepSeek Harness）工具插件：为 Agent 提供**微信公众号文章存档与全文读取**能力，由 [2100laike 微信存档](https://wx.2100laike.com)提供服务。

遇到 `mp.weixin.qq.com` 链接时，Agent 用 `wx_archive` 工具代替直接抓网页：

- **未存档的文章**：自动提交存档（图片转存到 CDN 不裂链、原文删除不受影响），等待抓取完成后返回全文 Markdown
- **已存档的文章**：直接返回最新版全文（去重命中，不消耗额度）
- **版本历史**：文章被修改过可带 `refresh: true` 重抓新版本

## 安装

```sh
dsh plugin add github:opencamel/dsh-wx-archive#v0.1.0
```

产物已含编译好的 `dist/`，git 安装无需执行构建脚本。

## 配置

在你的 `cordis.yml` 中按需覆盖（均有默认值）：

```yaml
- insert:
  - id: dsh-wx-archive
    name: dsh-wx-archive
    config:
      apiBaseUrl: 'https://api.2100laike.com'  # 存档 API 地址
      token: ''                                # 可选 PAT，见下
      waitTimeoutSec: 60                       # 新文章等待抓取完成的轮询上限（秒）
      pollIntervalSec: 2                       # 轮询间隔（秒）
      maxContentChars: 30000                   # 返回正文最大字符数，超出截断并附快照链接
```

### 额度与 PAT

匿名使用每个插件实例 **8 次/天**（重启后重新计数）。在 [open.2100laike.com](https://open.2100laike.com) 创建 PAT（`pat_2100_` 前缀）填入 `token` 后：

- 额度提升到 **100 次/天**
- 解锁 `refresh: true` 强制重抓（受服务端 24 小时冷却保护，冷却内跳过且不耗额度）

## 工具契约

| 项 | 值 |
|----|----|
| 名称 | `wx_archive` |
| 参数 | `url`（string，必填）· `refresh`（boolean，默认 false） |
| 返回 | `{ archive_id, url, title, author, version, fetched_at, deleted, refresh_skipped, snapshot_url, truncated, markdown, note }` |

错误信息带错误码与中文说明，模型可直接理解并转达（如额度耗尽时会提示配置 PAT）。

## 网络与安全声明

- 插件**只**访问配置项 `apiBaseUrl` 指向的 2100laike 存档 API（默认 `https://api.2100laike.com`），请求内容仅为：调用方传入的文章 URL、以及（如已配置）用户自己的 PAT 作为 Bearer 头
- 不使用 eval / child_process，不读取任何本地凭据、环境变量或敏感路径，无任何遥测
- 运行时依赖仅 `@deepseek-ai/*` 官方包（peerDependencies）

## 构建（可复现）

源码仓库：https://github.com/opencamel/dsh-wx-archive （每个 tag 对应发布版本）

```sh
pnpm install
pnpm build       # esbuild 编译 lib/index.js
pnpm typecheck   # tsc --noEmit
pnpm pack        # 打出 npm 结构 tarball
```

提交至 WhaleHarness 的 tarball 的 sha256 与对应源码 commit 见 GitHub Releases。

## License

MIT
