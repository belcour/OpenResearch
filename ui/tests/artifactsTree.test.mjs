import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { m } from "../src/paraglide/messages.js";
import { ltr } from "../src/i18n.ts";
import { find, renderApp, serveApp, settle } from "./render.mjs";

const artifactsFixture = () => ({
  dir: "/data/files/p",
  truncated: false,
  entries: [
    {
      name: "data",
      path: "data",
      isDir: true,
      size: 0,
      modifiedAt: 3000,
      children: [
        {
          name: "run-1",
          path: "data/run-1",
          isDir: true,
          size: 0,
          modifiedAt: 2000,
          children: [
            { name: "metrics.json", path: "data/run-1/metrics.json", isDir: false, size: 6, modifiedAt: 1000, presentation: "text", children: [] },
          ],
        },
        { name: "notes.md", path: "data/notes.md", isDir: false, size: 5, modifiedAt: 1500, presentation: "text", children: [] },
      ],
    },
    { name: "README.md", path: "README.md", isDir: false, size: 4, modifiedAt: 900, presentation: "text", children: [] },
  ],
});

/** The names the tree shows, in displayed order. */
const shownNames = () => [...document.body.querySelectorAll(".file-tree-name")].map((element) => element.textContent);

/** The artifacts tab of the project opened straight from a deep-linked pane. */
async function openArtifacts() {
  localStorage.clear();
  serveApp({
    "GET /api/projects": () => ({ projects: [{ id: "p", name: "Project" }] }),
    "GET /api/projects/p/files": () => artifactsFixture(),
  });
  await renderApp(`/projects/p/tasks/new?pane=${encodeURIComponent(JSON.stringify({ kind: "home", view: "artifacts" }))}`);
  await settle();
}

const treeRowFor = (name) =>
  [...document.body.querySelectorAll(".artifact-tree-row")].find(
    (element) => element.querySelector(".file-tree-name")?.textContent === name,
  );

const openFolderMenu = async (path) => {
  const row = treeRowFor(path);
  assert.ok(row, `folder row for ${path}`);
  await act(async () => {
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 8 }));
  });
  await settle();
  const menu = find('[role="menu"]');
  assert.ok(menu, `${path} context menu`);
  return menu;
};

test("the artifacts tree starts collapsed so only the directory level shows", async () => {
  await openArtifacts();
  assert.deepEqual(shownNames(), ["data", "README.md"]);
});

test("a nested folder only appears when its parent is expanded, in modified-date order", async () => {
  await openArtifacts();
  const chevron = find(`button[aria-label="${m.artifact_expand_folder({ name: ltr("data") })}"]`);
  assert.ok(chevron, "expand chevron on the data folder");
  assert.equal(chevron.getAttribute("aria-expanded"), "false");
  await act(async () => chevron.click());
  await settle();
  assert.equal(chevron.getAttribute("aria-expanded"), "true");
  // Direct children in the order the server lists them — newest first, files after folders.
  assert.deepEqual(shownNames(), ["data", "run-1", "notes.md", "README.md"]);
  // The grandchild stays hidden until run-1 is opened.
  assert.equal(document.body.textContent.includes("metrics.json"), false);
});

test("right-clicking a folder row offers Download, Reveal, Copy path and Delete — no file actions", async () => {
  await openArtifacts();
  const menu = await openFolderMenu("data");
  assert.equal(menu.getAttribute("aria-label"), m.file_tree_folder_actions({ path: ltr("data") }));
  const labels = [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
  assert.ok(labels.includes(m.file_viewer_download()), "has Download");
  assert.ok(labels.includes(m.artifacts_copy_path()), "has Copy path");
  assert.ok(labels.includes(m.chat_panel_delete()), "has Delete");
  assert.equal(labels.includes(m.file_tree_open()), false, "no Open");
  assert.equal(labels.includes(m.chat_panel_rename()), false, "no Rename");
  assert.equal(labels.includes(m.file_tree_duplicate()), false, "no Duplicate");
  assert.equal(labels[0], m.file_viewer_download(), "Download leads the folder menu");
  await act(async () => window.dispatchEvent(new Event("blur")));
  await settle();
  assert.equal(find('[role="menu"]'), null);
});

test("the folder menu also opens from the context-menu key on the row", async () => {
  await openArtifacts();
  const row = treeRowFor("data");
  await act(async () => {
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true }));
  });
  await settle();
  const menu = find('[role="menu"]');
  assert.ok(menu, "context-menu key opened the menu");
  assert.equal(menu.getAttribute("aria-label"), m.file_tree_folder_actions({ path: ltr("data") }));
  const labels = [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
  assert.ok(labels.includes(m.file_viewer_download()));
  assert.equal(labels.includes(m.file_tree_open()), false);
});

test("Downloading a folder starts a zip download of the export endpoint", async () => {
  await openArtifacts();
  const menu = await openFolderMenu("data");
  const downloadItem = [...menu.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === m.file_viewer_download());
  assert.ok(downloadItem, "Download item");
  const downloads = [];
  const originalClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ href: this.href, download: this.download });
  };
  try {
    await act(async () => downloadItem.click());
    await settle();
  } finally {
    window.HTMLAnchorElement.prototype.click = originalClick;
  }
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].href, /\/api\/projects\/p\/files\/archive\?path=data$/);
  assert.equal(downloads[0].download, "data.zip");
  assert.equal(find('[role="menu"]'), null, "the menu closed after the item action");
});

test("a file row keeps the file menu — Open stays, Download does not appear", async () => {
  await openArtifacts();
  const row = treeRowFor("README.md");
  await act(async () => {
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 8 }));
  });
  await settle();
  const menu = find('[role="menu"]');
  assert.ok(menu, "file context menu");
  assert.equal(menu.getAttribute("aria-label"), m.file_tree_file_actions({ path: ltr("README.md") }));
  const labels = [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
  assert.equal(labels[0], m.file_tree_open(), "Open leads the file menu");
  assert.equal(labels.includes(m.file_viewer_download()), false, "no Download for a file");
  assert.ok(labels.includes(m.artifacts_copy_path()));
});
