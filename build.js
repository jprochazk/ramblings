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
 * @returns {Record<string, any> & { content: string }}
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
 * @returns {{ body: string, context: Record<string, string> }}
 */
export function transform(markdown, template, options = {}) {
  /** @type {Record<string, any>} */
  const context = {
    ...parse(markdown),
    refresh: options.dev,
  };
  return {
    body: handlebars.compile(template, { noEscape: true })(context),
    context,
  };
}

/**
 * @param {string} dir
 * @returns {Promise<string | string[]>}
 */
async function getFiles(dir) {
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
 *
 * @param {string} cwd
 * @param {Record<string, any>[]} posts
 */
async function generateIndex(cwd, posts) {
  const index = await fs.readFile(path.join(cwd, "public/index.html"), "utf8");
  const result = handlebars.compile(index, { noEscape: true })({ posts });
  await fs.writeFile(path.join(cwd, "build", "index.html"), result, "utf8");
  await fs.writeFile(path.join(cwd, "build/posts", "index.html"), result, "utf8");
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
  const posts = [];
  const files = await getFiles(path.join(dirs.build, "posts"));
  /** @param {string} file */
  async function handle(file) {
    const ext = path.extname(file);
    if (ext !== ".md") return Promise.resolve();

    const out = path.join(path.dirname(file), path.basename(file, ext) + ".html");
    const content = await fs.readFile(file, "utf8");
    const result = transform(content, template);
    await fs.writeFile(out, result.body, "utf8");
    await fs.rm(file, { force: true });

    posts.push({
      heading: result.context.heading,
      date: result.context.date,
      href: `/posts/${path.basename(path.dirname(file))}`,
    });
  }

  if (Array.isArray(files)) {
    await Promise.all(files.map(handle));
  } else {
    await handle(files);
  }

  await generateIndex(cwd, posts);
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  // module was called directly
  await build();
}
