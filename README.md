# dsh-wx-archive

[DSH](https://github.com/deepseek-ai/deepseek-harness)（DeepSeek Harness）工具插件：为 Agent 提供**微信公众号文章存档与全文读取**能力，由 [2100laike 微信存档](https://wx.2100laike.com)提供服务。

遇到 `mp.weixin.qq.com` 链接时，Agent 用 `wx_archive` 工具代替直接抓网页：

- **未存档的文章**：自动提交存档（图片转存到 CDN 不裂链、原文删除不受影响），等待抓取完成后返回全文 Markdown
- **已存档的文章**：直接返回最新版全文（去重命中，不消耗额度）
- **版本历史**：文章被修改过可带 `refresh: true` 重抓新版本

## 环境要求

- **dsh ≥ 0.1.0-rc.6**（插件 peer 依赖 `@deepseek-ai/dsh-tools >= 0.1.0-rc.6`；`dsh --version` 查看，旧版 dsh 可能无法解析 peer）
- **PATH 上有 pnpm**（`dsh plugin` 底层转发给 pnpm 执行，缺失会报 127 / `command not found`）

## 安装

`dsh plugin` **必须**用 `--profile` 指定目标 profile，否则报 `required option '--profile <name>' not specified`。插件**按 profile 安装**：装进你实际运行的那个 profile 才会在该环境出现（装错 profile 不会报错，只是工具不出现）；web 和 headless 都用的话各装一次。profile 首次使用时会自动初始化：

```sh
# Web GUI 用户（dsh web 即 web profile）
dsh plugin --profile web add github:opencamel/dsh-wx-archive#v0.1.2
# 纯 CLI 用户（headless profile：dsh --profile headless "任务描述" 一次性执行并退出）
dsh plugin --profile headless add github:opencamel/dsh-wx-archive#v0.1.2
```

`#v0.1.2` 为当前最新 tag；新版本见 [GitHub Releases](https://github.com/opencamel/dsh-wx-archive/releases)，安装时替换为最新 tag 即可。产物已含编译好的 `lib/index.js`，git 安装无需执行构建脚本。

除 `github:` 外，本地源码目录或 tarball 等 pnpm 支持的安装源同样可用（相对路径按执行命令时的当前目录解析）：

```sh
dsh plugin --profile web add /path/to/dsh-wx-archive
```

安装结束时 pnpm 可能打印如下警告，**属预期、可忽略**——这些 peer 由 DSH 在安装级 `~/.dsh/profiles/node_modules/` 统一提供，无需在插件目录内另行安装：

```
✕ missing peer @deepseek-ai/cordis
✕ missing peer @deepseek-ai/dsh-tools
✕ missing peer @deepseek-ai/schemastery
```

### 安装后必须重启才生效

插件只在 dsh 进程启动时加载一次：**GUI 正在运行时装完插件，工具不会出现在当前会话**，需退出并重新启动（Web GUI 即重新运行 `dsh web`）。headless 模式无需关心这一点——每次 `dsh --profile headless "..."` 都是新进程，下一次运行自动带上新装插件。注意与配置改动的区别——`cordis.patch.yml` 的改动是热生效的，插件安装/卸载不是。

⚠ 也不要试图往 `cordis.patch.yml` 手动 insert 插件 entry 来"热激活"：重启时会与插件 bundle 层产生重复，loader 报 `duplicate loader entry id: dsh-wx-archive` 并拒绝启动。

### 验证安装

```sh
dsh --profile <name> --dump-config | grep -A2 wx-archive
# 预期输出：
# # == dsh-wx-archive
# - id: dsh-wx-archive
#   name: dsh-wx-archive
```

`<name>` 换成实际 profile（web / headless）。也可以直接查看 `~/.dsh/profiles/<name>/package.json` 的 `dsh.profile.bundles` 列表中是否含 `dsh-wx-archive`。

## 配置

在 **profile 的 `cordis.patch.yml`**（`~/.dsh/profiles/<name>/cordis.patch.yml`，如 web → `~/.dsh/profiles/web/cordis.patch.yml`、headless → `~/.dsh/profiles/headless/cordis.patch.yml`）中按需覆盖，改动热生效。⚠ 不要改同目录的 `cordis.yml`——那是 dsh 每次启动自动重写的合成根配置，改动会被覆盖（文件头注释即标明 "Edit cordis.patch.yml, not this file"）：

```yaml
- insert:
  - id: dsh-wx-archive
    name: dsh-wx-archive
    config:
      apiBaseUrl: 'https://api.2100laike.com'  # 存档 API 地址
      token: ''                                # 可选 PAT，见下
      waitTimeoutSec: 60                       # 新文章等待抓取完成的轮询上限（秒）
      pollIntervalSec: 2                       # 轮询间隔（秒）
      maxContentChars: 30000                   # 返回正文最大字符数，超出截断并附快照链接（下限 1000）
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

### 错误码

调用直接报错时，错误信息形如 `[wx-archive <错误码>] 中文说明`，模型可直接理解并转达（不抛错的软失败见下节）：

| 错误码 | 含义 / 处置 |
|--------|-------------|
| `RATE_LIMITED` | 当日额度耗尽 → 配置 PAT 提升额度 |
| `FORCE_NOT_ALLOWED` | `refresh` 强制重抓需要 PAT → 配置 `token` |
| `WX_TEMPORARY_LINK`（422） | 传入的是微信临时分享链接（`src=11` 带签名）→ 改用文章永久链接 `https://mp.weixin.qq.com/s/...` |

### 延迟预期与软失败（不报错，体现在返回的 `note`）

- **已存档文章**：去重命中，立即返回，不消耗额度
- **新文章**：需现场抓取，插件轮询等待，最长 `waitTimeoutSec`（默认 60 秒）；超时返回 `note`「抓取尚未完成」，**稍后再次调用即可读取**（此时已入档，秒回且不重复扣额度）
- **已存档后被删文的文章**：正常返回存档内容，`deleted: true` 并注明原文已被发布者删除
- **正文快照读取失败**（服务端快照缺失，`NO_CONTENT`）：`note` 提示稍后重试，或访问 `snapshot_url`

### 截断与全文

正文超过 `maxContentChars` 会被截断（下限 1000：配置低于 1000 时按 1000 生效），返回中标记 `truncated: true` 并附 `snapshot_url`——访问该链接查看完整快照。

## 升级 / 卸载

```sh
# 覆盖升级到新 tag（如 v0.1.3）
dsh plugin --profile <name> add github:opencamel/dsh-wx-archive#v0.1.3
# 卸载
dsh plugin --profile <name> remove dsh-wx-archive
```

`<name>` 换成安装时用的 profile。与安装相同，升级/卸载后需重启该 profile 的 dsh 进程才生效（headless 下次运行自然生效）。

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

发布 tarball 的 sha256 与对应源码 commit 见 GitHub Releases。

## License

MIT
