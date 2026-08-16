import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "dist/index.js",
  // 运行时依赖由安装方（dsh plugin add → pnpm）提供，不打进产物
  external: ["@deepseek-ai/cordis", "@deepseek-ai/dsh-tools", "@deepseek-ai/schemastery", "node:*"],
});

console.log("dist/index.js built");
