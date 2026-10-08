const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const APP_PAGE = path.join(__dirname, "..", "index.html");
const APPROVED_ROOTS_FILE = path.join(app.getPath("userData"), "approved-project-folders.json");
const approvedProjectRoots = new Set();
const approvedParentRoots = new Set();
let updateCheckPromise = null;
let updateState = { status: "idle", version: app.getVersion() };

function assertTrustedSender(event) {
  const frameUrl = event.senderFrame?.url;
  if (!frameUrl) throw new Error("Untrusted app request.");
  const url = new URL(frameUrl);
  if (url.protocol !== "file:" || path.resolve(fileURLToPath(url)) !== APP_PAGE) {
    throw new Error("Untrusted app request.");
  }
}

function registerHandler(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return handler(...args);
  });
}

function resolveVaultRoot(rootPath) {
  if (typeof rootPath !== "string" || !path.isAbsolute(rootPath)) {
    throw new Error("A valid project folder must be selected.");
  }
  return path.resolve(rootPath);
}

async function approveRoot(rootPath, purpose) {
  const root = await fs.realpath(resolveVaultRoot(rootPath));
  if (purpose === "parent") approvedParentRoots.add(root);
  else approvedProjectRoots.add(root);
  await fs.mkdir(path.dirname(APPROVED_ROOTS_FILE), { recursive: true });
  await fs.writeFile(APPROVED_ROOTS_FILE, JSON.stringify({
    projects: [...approvedProjectRoots],
    parents: [...approvedParentRoots]
  }), "utf8");
  return root;
}

async function requireApprovedProject(rootPath) {
  const root = await fs.realpath(resolveVaultRoot(rootPath));
  if (!approvedProjectRoots.has(root)) throw new Error("Open this project folder in Veritas before accessing it.");
  return root;
}

async function requireApprovedParent(rootPath) {
  const root = await fs.realpath(resolveVaultRoot(rootPath));
  if (!approvedParentRoots.has(root)) throw new Error("Choose a destination folder in Veritas before creating a project there.");
  return root;
}

function resolveVaultFile(rootPath, relativePath) {
  const root = resolveVaultRoot(rootPath);
  if (typeof relativePath !== "string" || !relativePath || relativePath.includes("\0")) {
    throw new Error("Invalid project file path.");
  }
  const segments = relativePath.replace(/\\/g, "/").split("/");
  if (segments.some(segment => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    throw new Error("Invalid project file path.");
  }
  const target = path.resolve(root, ...segments);
  const relativeTarget = path.relative(root, target);
  if (!relativeTarget || relativeTarget === ".." || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
    throw new Error("Project file path is outside the selected folder.");
  }
  if (!/\.(md|json)$/i.test(target)) throw new Error("Only Markdown and JSON project files are supported.");
  return { root, target, segments };
}

async function ensureSafeParent(root, segments) {
  let directory = root;
  for (const segment of segments) {
    directory = path.join(directory, segment);
    try {
      const info = await fs.lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error("Project paths cannot contain links or non-directory entries.");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(directory);
    }
  }
  return directory;
}

async function readProjectFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readProjectFiles(entryPath, relative));
    } else if (entry.isFile() && /\.(md|json)$/i.test(entry.name)) {
      files.push({ path: relative, content: await fs.readFile(entryPath, "utf8") });
    }
  }
  return files;
}

function registerProjectFileHandlers() {
  registerHandler("veritas:choose-directory", async (title, purpose) => {
    const result = await dialog.showOpenDialog({
      title: typeof title === "string" ? title : "Choose project folder",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const selectedPath = await approveRoot(result.filePaths[0], purpose === "parent" ? "parent" : "project");
    return { path: selectedPath, name: path.basename(selectedPath) };
  });

  registerHandler("veritas:create-project-folder", async (parentPath, folderName) => {
    const parent = await requireApprovedParent(parentPath);
    if (typeof folderName !== "string" || !folderName.trim() || folderName !== path.basename(folderName) || folderName === "." || folderName === "..") {
      throw new Error("Invalid project folder name.");
    }
    const projectPath = path.join(parent, folderName);
    await fs.mkdir(projectPath);
    const approvedPath = await approveRoot(projectPath, "project");
    return { path: approvedPath, name: folderName };
  });

  registerHandler("veritas:read-project", async rootPath => {
    const root = await requireApprovedProject(rootPath);
    return readProjectFiles(root);
  });

  registerHandler("veritas:write-project-file", async (rootPath, relativePath, content) => {
    if (typeof content !== "string") throw new Error("Project file content must be text.");
    const approvedRoot = await requireApprovedProject(rootPath);
    const { root, segments } = resolveVaultFile(approvedRoot, relativePath);
    const parent = await ensureSafeParent(root, segments.slice(0, -1));
    const target = path.join(parent, segments.at(-1));
    try {
      const info = await fs.lstat(target);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error("Project files cannot be links or non-file entries.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.writeFile(target, content, "utf8");
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: "#17191d",
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const sendWindowState = () => {
    if (!window.isDestroyed()) window.webContents.send("veritas:window-state", { maximized: window.isMaximized() });
  };
  window.on("maximize", sendWindowState);
  window.on("unmaximize", sendWindowState);
  window.webContents.on("did-finish-load", sendWindowState);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("mailto:")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).protocol !== "file:" || path.resolve(fileURLToPath(url)) !== APP_PAGE) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  void window.loadFile(APP_PAGE);
}

ipcMain.handle("veritas:control-window", (event, action) => {
  assertTrustedSender(event);
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("The application window is unavailable.");
  if (!["minimize", "maximize", "close"].includes(action)) throw new Error("Invalid window action.");
  if (action === "minimize") window.minimize();
  else if (action === "maximize") {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  } else window.close();
});

function setupUpdates() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => {
    if (!["available", "downloading", "downloaded"].includes(updateState.status)) {
      publishUpdateState({ status: "checking", version: app.getVersion() });
    }
  });
  autoUpdater.on("update-not-available", info => {
    if (updateState.status !== "downloaded") publishUpdateState({ status: "current", version: info.version });
  });
  autoUpdater.on("update-available", info => {
    publishUpdateState({ status: "available", version: info.version });
  });
  autoUpdater.on("download-progress", progress => publishUpdateState({
    status: "downloading",
    version: updateState.version,
    percent: progress.percent,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond
  }));
  autoUpdater.on("update-downloaded", info => publishUpdateState({ status: "downloaded", version: info.version, percent: 100 }));
  autoUpdater.on("update-cancelled", info => publishUpdateState({
    status: "error",
    version: info.version,
    message: "The update download was cancelled."
  }));
  autoUpdater.on("error", error => {
    console.error("Update check failed.", error);
    publishUpdateState({ status: "error", version: updateState.version, message: error.message });
  });
  const checkForUpdates = () => void performUpdateCheck().catch(error => console.error("Could not check for updates.", error));
  checkForUpdates();
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
}

function publishUpdateState(nextState) {
  updateState = { ...updateState, ...nextState };
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("veritas:update-state", updateState);
  }
}

async function performUpdateCheck() {
  if (!app.isPackaged) return { status: "unavailable", version: app.getVersion() };
  if (!updateCheckPromise) {
    updateCheckPromise = autoUpdater.checkForUpdates()
      .then(result => ({
        status: result?.isUpdateAvailable ? "available" : "current",
        version: result?.updateInfo?.version || app.getVersion()
      }))
      .finally(() => { updateCheckPromise = null; });
  }
  return updateCheckPromise;
}

registerHandler("veritas:check-for-updates", performUpdateCheck);
registerHandler("veritas:get-update-state", () => updateState);
registerHandler("veritas:install-update", () => {
  if (updateState.status !== "downloaded") throw new Error("The update has not finished downloading.");
  autoUpdater.quitAndInstall();
});

async function restoreApprovedRoots() {
  try {
    const storedRoots = JSON.parse(await fs.readFile(APPROVED_ROOTS_FILE, "utf8"));
    if (!Array.isArray(storedRoots.projects) || !Array.isArray(storedRoots.parents)) throw new Error("Invalid approved project folder list.");
    for (const [roots, collection] of [[storedRoots.projects, approvedProjectRoots], [storedRoots.parents, approvedParentRoots]]) {
      for (const root of roots) {
        try {
          const resolved = await fs.realpath(resolveVaultRoot(root));
          if (resolved === root) collection.add(resolved);
        } catch (error) {
          if (error.code !== "ENOENT") console.error("Could not restore an approved project folder.", error);
        }
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Could not load approved project folders.", error);
  }
}

app.setAppUserModelId("com.veritas.studio");
registerProjectFileHandlers();

app.whenReady().then(async () => {
  await restoreApprovedRoots();
  createWindow();
  setupUpdates();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
