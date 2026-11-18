// src/index.ts
import { randomUUID } from "node:crypto";
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
var name = "wx-archive";
var inject = ["tools"];
var Config = Schema.object({
  apiBaseUrl: Schema.string().default("https://api.2100laike.com").description("2100laike API \u57FA\u7840\u5730\u5740"),
  token: Schema.string().default("").description("\u53EF\u9009 PAT\uFF08pat_2100_ \u524D\u7F00\uFF0C\u6CE8\u518C\u8D26\u6237\u540E\u5728 app.2100laike.com/settings/developer \u521B\u5EFA\uFF09\u3002\u914D\u7F6E\u540E\u989D\u5EA6\u4ECE\u533F\u540D 8 \u6B21/\u5929\u63D0\u5347\u5230 100 \u6B21/\u5929\uFF0C\u5E76\u53EF\u7528 refresh \u5F3A\u5236\u91CD\u6293"),
  waitTimeoutSec: Schema.number().default(60).description("\u65B0\u6587\u7AE0\u63D0\u4EA4\u540E\u7B49\u5F85\u6293\u53D6\u5B8C\u6210\u7684\u8F6E\u8BE2\u4E0A\u9650\uFF08\u79D2\uFF09"),
  pollIntervalSec: Schema.number().default(2).description("\u8F6E\u8BE2\u95F4\u9694\uFF08\u79D2\uFF09"),
  maxContentChars: Schema.number().default(3e4).description("\u8FD4\u56DE Markdown \u7684\u6700\u5927\u5B57\u7B26\u6570\uFF0C\u8D85\u51FA\u622A\u65AD\u5E76\u9644\u5FEB\u7167\u94FE\u63A5")
});
var stripDocumentPreamble = (md) => {
  const m = md.trimStart().match(/^#\s+[^\n]+\n+Source:\s*\S+\n+/);
  return (m ? md.trimStart().slice(m[0].length) : md).trim();
};
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function apply(ctx, config) {
  const baseUrl = config.apiBaseUrl.replace(/\/+$/, "");
  const anonId = `dsh-${randomUUID()}`;
  const headers = { "content-type": "application/json" };
  if (config.token) {
    headers.authorization = `Bearer ${config.token.trim()}`;
  } else {
    headers["x-2100-anonymous-id"] = anonId;
  }
  const request = async (path, init, signal) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init?.method || "GET",
      headers,
      body: init?.body === void 0 ? void 0 : JSON.stringify(init.body),
      signal
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      const code = json?.error?.code || "HTTP_ERROR";
      let message = json?.error?.message || `HTTP ${res.status} \u8BF7\u6C42 ${baseUrl}${path} \u5931\u8D25`;
      if (code === "RATE_LIMITED") message += "\uFF08\u6CE8\u518C\u540E\u521B\u5EFA\u7684 PAT \u586B\u5165\u63D2\u4EF6\u914D\u7F6E token \u5373\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F\uFF09";
      if (code === "FORCE_NOT_ALLOWED") message += "\uFF08refresh \u9700\u8981 PAT\uFF1A\u6CE8\u518C\u8D26\u6237 app.2100laike.com/register \u2192 \u5728 app.2100laike.com/settings/developer \u521B\u5EFA PAT \u2192 \u586B\u5165\u63D2\u4EF6\u914D\u7F6E token\uFF09";
      throw new Error(`[wx-archive ${code}] ${message}`);
    }
    return json.data;
  };
  ctx.tools.register(
    defineTool({
      name: "wx_archive",
      description: "\u5B58\u6863\u5E76\u8BFB\u53D6\u5FAE\u4FE1\u516C\u4F17\u53F7\u6587\u7AE0\u4E0E\u8D34\u56FE\u5168\u6587\u3002\u63D0\u4EA4 mp.weixin.qq.com \u94FE\u63A5\uFF1A\u672A\u5B58\u6863\u8FC7\u7684\u5185\u5BB9\u4F1A\u5148\u6293\u53D6\uFF08\u56FE\u7247\u8F6C\u5B58\u3001\u9632\u5220\u6587\u3001\u9632\u88C2\u94FE\uFF09\uFF0C\u5DF2\u5B58\u6863\u7684\u76F4\u63A5\u8FD4\u56DE\u6700\u65B0\u7248\u5168\u6587 Markdown\uFF08\u53BB\u91CD\u547D\u4E2D\u4E0D\u6D88\u8017\u989D\u5EA6\uFF09\u3002\u666E\u901A\u56FE\u6587\u6587\u7AE0\u4E0E\u8D34\u56FE\uFF08\u56FE\u7247\u6D88\u606F\uFF0C\u6807\u9898+\u56FE\u7247\u5217\u8868\u5F62\u6001\uFF09\u7684\u94FE\u63A5\u683C\u5F0F\u76F8\u540C\uFF0C\u670D\u52A1\u7AEF\u6293\u53D6\u540E\u81EA\u52A8\u533A\u5206\uFF0C\u8FD4\u56DE content_kind\uFF08article=\u56FE\u6587\u6587\u7AE0\uFF0Csticker=\u8D34\u56FE\uFF09\u3002\u9700\u8981\u8BFB\u53D6\u5FAE\u4FE1\u5185\u5BB9\u65F6\u4F7F\u7528\u672C\u5DE5\u5177\uFF0C\u800C\u4E0D\u662F\u76F4\u63A5\u6293\u53D6\u7F51\u9875\u3002",
      parameters: {
        url: {
          type: "string",
          required: true,
          description: "\u5FAE\u4FE1\u516C\u4F17\u53F7\u6C38\u4E45\u77ED\u94FE\uFF08https://mp.weixin.qq.com/s/...\uFF0C\u5373\u6587\u7AE0\u9875\u53F3\u4E0A\u89D2\u300C\u2026\u300D\u2192\u300C\u590D\u5236\u94FE\u63A5\u300D\u6240\u5F97\uFF09\uFF0C\u56FE\u6587\u6587\u7AE0\u4E0E\u8D34\u56FE\uFF08\u56FE\u7247\u6D88\u606F\uFF09\u5747\u4E3A\u6B64\u683C\u5F0F\uFF0C\u65E0\u9700\u533A\u5206\u3002\u4E34\u65F6\u5206\u4EAB\u94FE\u63A5\uFF08src=11 + timestamp/signature\uFF09\u4E0E __biz \u53C2\u6570\u957F\u94FE\uFF08/s?__biz=\u2026\uFF09\u90FD\u4F1A\u88AB\u670D\u52A1\u7AEF\u62D2\u7EDD\uFF08422 WX_TEMPORARY_LINK / WX_LONG_LINK\uFF09\u2014\u2014\u82E5\u624B\u91CC\u53EA\u6709 __biz \u957F\u94FE\u6216\u5143\u6570\u636E\uFF08biz/mid/sn\uFF09\uFF0C\u8BF7\u52FF\u62FC\u88C5\u63D0\u4EA4"
        },
        refresh: {
          type: "boolean",
          description: "\u5F3A\u5236\u91CD\u6293\u6700\u65B0\u7248\u3002\u4EC5\u5F53\u6587\u7AE0\u7591\u4F3C\u66F4\u65B0\u65F6\u4F7F\u7528\uFF1B\u9700\u8981\u914D\u7F6E PAT token\uFF0C\u4E14\u53D7\u670D\u52A1\u7AEF\u51B7\u5374\u9650\u5236\uFF08\u9ED8\u8BA4 24 \u5C0F\u65F6\u5185\u53EA\u6293\u4E00\u6B21\uFF09"
        }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => {
          const out = value;
          const kindLabel = out.content_kind === "sticker" ? "\u8D34\u56FE" : "\u6587\u7AE0";
          const lines = [
            `[\u5FAE\u4FE1\u5B58\u6863\xB7${kindLabel}] ${out.title || "(\u672A\u547D\u540D)"}`,
            `\u4F5C\u8005: ${out.author || "\u2014"} \xB7 \u7248\u672C v${out.version ?? "?"} \xB7 \u6293\u53D6\u4E8E ${out.fetched_at || "\u2014"} \xB7 \u5B58\u6863ID ${out.archive_id}`
          ];
          if (out.deleted) lines.push("\u26A0 \u539F\u6587\u5DF2\u88AB\u53D1\u5E03\u8005\u5220\u9664\uFF0C\u4EE5\u4E0B\u4E3A\u5B58\u6863\u5185\u5BB9");
          if (out.refresh_skipped) lines.push(`\u672C\u6B21\u672A\u91CD\u6293\uFF08${out.refresh_skipped}${out.next_fetch_eligible_at ? `\uFF0C${out.next_fetch_eligible_at} \u540E\u53EF\u91CD\u6293` : ""}\uFF09`);
          if (out.truncated) lines.push(`\u6B63\u6587\u8D85\u8FC7\u957F\u5EA6\u4E0A\u9650\u5DF2\u622A\u65AD\uFF0C\u5B8C\u6574\u5FEB\u7167: ${out.snapshot_url}`);
          if (out.note) lines.push(out.note);
          lines.push("", "---", "", out.markdown || "(\u6B63\u6587\u6682\u4E0D\u53EF\u7528)");
          return [{ type: "text", text: lines.join("\n") }];
        }
      },
      // 协作式超时预算（声明性元数据，注册表不强执，供 timeout policy 参考）：
      // 轮询上限 + 读正文余量
      timeoutMs: (Math.max(1, config.waitTimeoutSec) + 15) * 1e3,
      async execute({ url, refresh }, exec) {
        const signal = exec.signal;
        const submitted = await request("/v1/archive", {
          method: "POST",
          body: { url, force: refresh === true }
        }, signal);
        const archiveId = submitted.archive_id;
        let detail = null;
        const deadline = Date.now() + Math.max(1, config.waitTimeoutSec) * 1e3;
        const pollMs = Math.max(1, config.pollIntervalSec) * 1e3;
        for (; ; ) {
          if (signal.aborted) break;
          detail = await request(`/v1/archives/${encodeURIComponent(archiveId)}`, void 0, signal);
          if (detail.latest_version) break;
          if (Date.now() + pollMs > deadline) break;
          await sleep(pollMs);
        }
        let content = null;
        if (detail?.latest_version && !signal.aborted) {
          try {
            content = await request(`/v1/archives/${encodeURIComponent(archiveId)}/content`, void 0, signal);
          } catch (error) {
            if (signal.aborted) throw error;
            content = null;
          }
        }
        let markdown = null;
        let truncated = false;
        if (content?.markdown) {
          markdown = stripDocumentPreamble(content.markdown);
          const limit = Math.max(1e3, config.maxContentChars);
          if (markdown.length > limit) {
            markdown = `${markdown.slice(0, limit)}

[\u5DF2\u622A\u65AD]`;
            truncated = true;
          }
        }
        const note = !markdown ? detail?.latest_version ? "\u6B63\u6587\u5FEB\u7167\u8BFB\u53D6\u5931\u8D25\uFF0C\u53EF\u7A0D\u540E\u91CD\u8BD5\u6216\u8BBF\u95EE\u5FEB\u7167\u94FE\u63A5" : `\u6293\u53D6\u5C1A\u672A\u5B8C\u6210\uFF08\u5DF2\u7B49\u5F85 ${config.waitTimeoutSec}s\uFF09\uFF0C\u53EF\u7A0D\u540E\u518D\u6B21\u8C03\u7528\u672C\u5DE5\u5177\u8BFB\u53D6` : null;
        return {
          archive_id: archiveId,
          url: detail?.url || url,
          title: detail?.title || submitted.title || "",
          author: detail?.author_name || "",
          content_kind: detail?.content_kind || "article",
          version: detail?.latest_version ?? null,
          fetched_at: content?.fetched_at || submitted.version?.fetched_at || null,
          deleted: Boolean(detail?.deleted_at || submitted.deleted_at),
          refresh_skipped: submitted.refresh_skipped,
          next_fetch_eligible_at: submitted.next_fetch_eligible_at,
          snapshot_url: detail?.snapshot_url || submitted.snapshot_url || null,
          truncated,
          markdown,
          note
        };
      }
    })
  );
}
export {
  Config,
  apply,
  inject,
  name
};
