const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("veritasDesktop", Object.freeze({
  chooseDirectory: (title, purpose) => ipcRenderer.invoke("veritas:choose-directory", title, purpose),
  createProjectFolder: (parentPath, folderName) => ipcRenderer.invoke("veritas:create-project-folder", parentPath, folderName),
  readProject: rootPath => ipcRenderer.invoke("veritas:read-project", rootPath),
  writeProjectFile: (rootPath, relativePath, content) => ipcRenderer.invoke("veritas:write-project-file", rootPath, relativePath, content),
  controlWindow: action => ipcRenderer.invoke("veritas:control-window", action),
  onWindowState: callback => {
    if (typeof callback !== "function") throw new TypeError("Window state listener must be a function.");
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("veritas:window-state", listener);
    return () => ipcRenderer.removeListener("veritas:window-state", listener);
  }
}));
