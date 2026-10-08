const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("veritasDesktop", Object.freeze({
  chooseDirectory: (title, purpose) => ipcRenderer.invoke("veritas:choose-directory", title, purpose),
  createProjectFolder: (parentPath, folderName) => ipcRenderer.invoke("veritas:create-project-folder", parentPath, folderName),
  readProject: rootPath => ipcRenderer.invoke("veritas:read-project", rootPath),
  writeProjectFile: (rootPath, relativePath, content) => ipcRenderer.invoke("veritas:write-project-file", rootPath, relativePath, content),
  checkForUpdates: () => ipcRenderer.invoke("veritas:check-for-updates"),
  getUpdateState: () => ipcRenderer.invoke("veritas:get-update-state"),
  installUpdate: () => ipcRenderer.invoke("veritas:install-update"),
  onUpdateState: callback => {
    if (typeof callback !== "function") throw new TypeError("Update state listener must be a function.");
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("veritas:update-state", listener);
    return () => ipcRenderer.removeListener("veritas:update-state", listener);
  },
  controlWindow: action => ipcRenderer.invoke("veritas:control-window", action),
  onWindowState: callback => {
    if (typeof callback !== "function") throw new TypeError("Window state listener must be a function.");
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("veritas:window-state", listener);
    return () => ipcRenderer.removeListener("veritas:window-state", listener);
  }
}));
