// dsh-wx-archive — 微信公众号文章存档 DSH 工具
// 通过 2100laike 微信存档 API（wx.2100laike.com）提交/读取文章全文快照：
// 未存档则提交并等待抓取完成，已存档直接返回最新版 Markdown（去重不耗额度）。

import { randomUUID } from "node:crypto";

import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "wx-archive";
export const inject = ["tools"];

export interface Config {
  apiBaseUrl: string;
  token: string;
  waitTimeoutSec: number;
  pollIntervalSec: number;
  maxContentChars: number;
}

export const Config: Schema<Config> = Schema.object({
  apiBaseUrl: Schema.string().default("https://api.2100laike.com").description("2100laike API 基础地址"),
  token: Schema.string().default("").description("可选 PAT（pat_2100_ 前缀）。配置后额度从匿名 8 次/天提升到 100 次/天，并可用 refresh 强制重抓"),
  waitTimeoutSec: Schema.number().default(60).description("新文章提交后等待抓取完成的轮询上限（秒）"),
  pollIntervalSec: Schema.number().default(2).description("轮询间隔（秒）"),
  maxContentChars: Schema.number().default(30000).description("返回 Markdown 的最大字符数，超出截断并附快照链接"),
});

interface SubmitResult {
  archive_id: string;
  status: "pending" | "completed";
  version: { no: number; fetched_at: string; snapshot_url: string | null } | null;
  title: string;
  snapshot_url: string | null;
  deleted_at: string | null;
  refresh_skipped: string | null;
  next_fetch_eligible_at: string | null;
}

interface ArchiveDetail {
  archive_id: string;
  url: string;
  title: string;
  summary: string;
  author_name: string;
  deleted_at: string | null;
  snapshot_url: string | null;
  latest_version: number | null;
  created_at: string;
}

interface ArchiveContent {
  archive_id: string;
  version_no: number;
  fetched_at: string;
  markdown: string;
}

interface ArchiveOutput {
  archive_id: string;
  url: string;
  title: string;
  author: string;
  version: number | null;
  fetched_at: string | null;
  deleted: boolean;
  refresh_skipped: string | null;
  next_fetch_eligible_at: string | null;
  snapshot_url: string | null;
  truncated: boolean;
  markdown: string | null;
  note: string | null;
}

// 快照文档统一以 "# 标题\nSource: url" 开头（导出用），页面/工具头部已展示，渲染前剥离。
const stripDocumentPreamble = (md: string) => {
  const m = md.trimStart().match(/^#\s+[^\n]+\n+Source:\s*\S+\n+/);
  return (m ? md.trimStart().slice(m[0].length) : md).trim();
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function apply(ctx: Context, config: Config) {
  const baseUrl = config.apiBaseUrl.replace(/\/+$/, "");
  const anonId = `dsh-${randomUUID()}`;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.token) {
    headers.authorization = `Bearer ${config.token.trim()}`;
  } else {
    headers["x-2100-anonymous-id"] = anonId;
  }

  const request = async <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init?.method || "GET",
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      const code = json?.error?.code || "HTTP_ERROR";
      let message = json?.error?.message || `HTTP ${res.status} 请求 ${baseUrl}${path} 失败`;
      if (code === "RATE_LIMITED") message += "（可在插件配置中设置 PAT token 提升额度）";
      if (code === "FORCE_NOT_ALLOWED") message += "（refresh 强制重抓需要在插件配置中设置 PAT token）";
      throw new Error(`[wx-archive ${code}] ${message}`);
    }
    return json.data as T;
  };

  ctx.tools.register(
    defineTool({
      name: "wx_archive",
      description:
        "存档并读取微信公众号文章全文。提交 mp.weixin.qq.com 链接：未存档过的文章会先抓取（图片转存、防删文、防裂链），已存档的直接返回最新版全文 Markdown（去重命中不消耗额度）。需要读取微信文章内容时使用本工具，而不是直接抓取网页。",
      parameters: {
        url: {
          type: "string",
          required: true,
          description: "微信公众号文章链接（https://mp.weixin.qq.com/s/...）",
        },
        refresh: {
          type: "boolean",
          description: "强制重抓最新版。仅当文章疑似更新时使用；需要配置 PAT token，且受服务端冷却限制（默认 24 小时内只抓一次）",
        },
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => {
          const out = value as unknown as ArchiveOutput;
          const lines: string[] = [
            `[微信存档] ${out.title || "(未命名)"}`,
            `作者: ${out.author || "—"} · 版本 v${out.version ?? "?"} · 抓取于 ${out.fetched_at || "—"} · 存档ID ${out.archive_id}`,
          ];
          if (out.deleted) lines.push("⚠ 原文已被发布者删除，以下为存档内容");
          if (out.refresh_skipped) lines.push(`本次未重抓（${out.refresh_skipped}${out.next_fetch_eligible_at ? `，${out.next_fetch_eligible_at} 后可重抓` : ""}）`);
          if (out.truncated) lines.push(`正文超过长度上限已截断，完整快照: ${out.snapshot_url}`);
          if (out.note) lines.push(out.note);
          lines.push("", "---", "", out.markdown || "(正文暂不可用)");
          return [{ type: "text", text: lines.join("\n") }];
        },
      },
      async execute({ url, refresh }) {
        const submitted = await request<SubmitResult>("/v1/archive", {
          method: "POST",
          body: { url, force: refresh === true },
        });
        const archiveId = submitted.archive_id;

        let detail: ArchiveDetail | null = null;
        const deadline = Date.now() + Math.max(1, config.waitTimeoutSec) * 1000;
        const pollMs = Math.max(1, config.pollIntervalSec) * 1000;
        // 新提交是异步抓取（pending）：轮询直到出现版本或超时；dedup/已有版本则一次即过。
        for (;;) {
          detail = await request<ArchiveDetail>(`/v1/archives/${encodeURIComponent(archiveId)}`);
          if (detail.latest_version) break;
          if (Date.now() + pollMs > deadline) break;
          await sleep(pollMs);
        }

        let content: ArchiveContent | null = null;
        if (detail?.latest_version) {
          try {
            content = await request<ArchiveContent>(`/v1/archives/${encodeURIComponent(archiveId)}/content`);
          } catch {
            content = null; // NO_CONTENT：抓取失败或快照缺失
          }
        }

        let markdown: string | null = null;
        let truncated = false;
        if (content?.markdown) {
          markdown = stripDocumentPreamble(content.markdown);
          const limit = Math.max(1000, config.maxContentChars);
          if (markdown.length > limit) {
            markdown = `${markdown.slice(0, limit)}\n\n[已截断]`;
            truncated = true;
          }
        }

        const note = !markdown
          ? detail?.latest_version
            ? "正文快照读取失败，可稍后重试或访问快照链接"
            : `抓取尚未完成（已等待 ${config.waitTimeoutSec}s），可稍后再次调用本工具读取`
          : null;

        return {
          archive_id: archiveId,
          url: detail?.url || url,
          title: detail?.title || submitted.title || "",
          author: detail?.author_name || "",
          version: detail?.latest_version ?? null,
          fetched_at: content?.fetched_at || submitted.version?.fetched_at || null,
          deleted: Boolean(detail?.deleted_at || submitted.deleted_at),
          refresh_skipped: submitted.refresh_skipped,
          next_fetch_eligible_at: submitted.next_fetch_eligible_at,
          snapshot_url: detail?.snapshot_url || submitted.snapshot_url || null,
          truncated,
          markdown,
          note,
        };
      },
    }),
  );
}
