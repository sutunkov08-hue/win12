const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('win12', {
  fs: {
    list: (p) => ipcRenderer.invoke('fs:list', p),
    home: () => ipcRenderer.invoke('fs:home'),
    desktop: () => ipcRenderer.invoke('fs:desktop'),
    join: (...a) => ipcRenderer.invoke('fs:join', ...a),
    dirname: (p) => ipcRenderer.invoke('fs:dirname', p),
    basename: (p) => ipcRenderer.invoke('fs:basename', p),
    sep: () => ipcRenderer.invoke('fs:sep'),
    exists: (p) => ipcRenderer.invoke('fs:exists', p),
    isDir: (p) => ipcRenderer.invoke('fs:isDir', p),
    readText: (p) => ipcRenderer.invoke('fs:readText', p),
    writeText: (p, c) => ipcRenderer.invoke('fs:writeText', p, c),
    mkdir: (p) => ipcRenderer.invoke('fs:mkdir', p),
    rename: (o, n) => ipcRenderer.invoke('fs:rename', o, n),
    delete: (p) => ipcRenderer.invoke('fs:delete', p),
    uniqueName: (d, b) => ipcRenderer.invoke('fs:uniqueName', d, b),
    isTextFile: (p) => ipcRenderer.invoke('fs:isTextFile', p),
    isImageFile: (p) => ipcRenderer.invoke('fs:isImageFile', p),
    knownFolder: (n) => ipcRenderer.invoke('fs:knownFolder', n),
    drives: () => ipcRenderer.invoke('fs:drives')
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
    quit: () => ipcRenderer.invoke('shell:quit'),
    clipboardWriteText: (t) => ipcRenderer.invoke('shell:clipboardWriteText', t),
    clipboardReadText: () => ipcRenderer.invoke('shell:clipboardReadText')
  },
  dialog: {
    openFile: (o) => ipcRenderer.invoke('dialog:openFile', o),
    saveFile: (o) => ipcRenderer.invoke('dialog:saveFile', o),
    openImage: () => ipcRenderer.invoke('dialog:openImage')
  }
});
