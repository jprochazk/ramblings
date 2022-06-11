// @ts-check

import { marked } from "marked";
import frontMatter from "front-matter";
import handlebars from "handlebars";
import hljs from "highlight.js";
import hljsSvelte from "highlightjs-svelte";
import { existsSync as exists, rmSync as rm, mkdirSync as mkdir } from "fs";
import * as fs from "fs/promises";
import * as fsExtra from "fs-extra";
import url from "url";
import path from "path";
import process from "process";

hljsSvelte(hljs);

/**
 * @typedef ParsedFile
 * @property {{ [field: string]: string }} front
 * @property {string} content
 */

/** @param {string} dir */
export function clean(dir) {
  if (exists(dir)) {
    rm(dir, { force: true, recursive: true });
  }
  mkdir(dir, { recursive: true });
}

marked.use({
  highlight(code, language) {
    return hljs.highlight(code, { language }).value;
  },
});

/**
 * @param {string} input
 * @returns {ParsedFile}
 */
export function parse(input) {
  const result = frontMatter(input);

  return {
    ...result.attributes,
    content: marked.parse(result.body),
  };
}

/**
 * @param {string} markdown
 * @param {string} template
 * @param {{ dev?: boolean | undefined }} options
 * @returns {string}
 */
export function transform(markdown, template, options = {}) {
  return handlebars.compile(template, { noEscape: true })({
    ...parse(markdown),
    refresh: options.dev,
  });
}

/**
 * @param {string} dir
 * @returns {Promise<string | string[]>}
 */
export async function getFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    })
  );
  return Array.prototype.concat(...files);
}

/**
 * @param {{ clean?: boolean | undefined }} options
 */
export async function build(options = { clean: true }) {
  const cwd = process.cwd();
  const dirs = {
    build: path.join(cwd, "build"),
    posts: path.join(cwd, "posts"),
    public: path.join(cwd, "public"),
  };
  const template = await fs.readFile(path.join(cwd, "template.html"), "utf8");

  if (options.clean) {
    // clean up previous output
    clean(dirs.build);
  }

  // copy `public`
  await fsExtra.copy("public", "build", { recursive: true });

  // copy `posts`
  await fsExtra.copy("posts", "build/posts", { recursive: true });

  // generate posts
  const files = await getFiles(path.join(dirs.build, "posts"));
  /** @param {string} file */
  async function handle(file) {
    const ext = path.extname(file);
    if (ext !== ".md") return Promise.resolve();

    const out = path.join(path.dirname(file), path.basename(file, ext) + ".html");
    const content = await fs.readFile(file, "utf8");
    await fs.writeFile(out, transform(content, template), "utf8");
    await fs.rm(file, { force: true });
  }

  if (Array.isArray(files)) {
    await Promise.all(files.map(handle));
  } else {
    await handle(files);
  }
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  // module was called directly
  await build();
}
