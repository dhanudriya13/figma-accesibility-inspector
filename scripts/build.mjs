import { build, context } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const watch = process.argv.includes("--watch");
const dist = path.join(root, "dist");

const common = {
  absWorkingDir: root,
  bundle: true,
  sourcemap: false,
  target: "es2020",
  platform: "browser",
  logLevel: "info",
  tsconfig: path.join(root, "tsconfig.json"),
};

const mainOptions = {
  ...common,
  entryPoints: ["src/main.ts"],
  outfile: "dist/code.js",
  format: "iife",
};

const uiOptions = {
  ...common,
  entryPoints: ["src/ui/app.ts"],
  outdir: "dist/ui",
  format: "iife",
  write: false,
};

async function writeUiHtml(outputFiles) {
  const js = outputFiles.find((file) => file.path.endsWith(".js"));
  const css = outputFiles.find((file) => file.path.endsWith(".css"));
  if (!js || !css) {
    throw new Error("UI bundle did not produce both a script and a stylesheet.");
  }

  const template = await readFile(path.join(root, "src/ui/index.html"), "utf8");
  const html = template
    .replace("/* INLINE_STYLE */", () => css.text)
    .replace("/* INLINE_SCRIPT */", () => js.text.replace(/<\/script/gi, "<\\/script"));

  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, "ui.html"), html, "utf8");
}

const uiHtmlPlugin = {
  name: "inline-ui-html",
  setup(buildContext) {
    buildContext.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      await writeUiHtml(result.outputFiles ?? []);
    });
  },
};

if (watch) {
  await rm(dist, { recursive: true, force: true });
  const mainContext = await context(mainOptions);
  const uiContext = await context({ ...uiOptions, plugins: [uiHtmlPlugin] });
  await Promise.all([mainContext.watch(), uiContext.watch()]);
  console.log("Watching src/ for changes. Reload the plugin in Figma to see updates.");
} else {
  await rm(dist, { recursive: true, force: true });
  await build(mainOptions);
  const uiResult = await build(uiOptions);
  await writeUiHtml(uiResult.outputFiles);
}
