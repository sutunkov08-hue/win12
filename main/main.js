const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0b1220',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const TEXT_EXT = new Set(['.txt', '.md', '.js', '.ts', '.json', '.html', '.css', '.xml', '.yml', '.yaml', '.csv', '.log', '.ini', '.bat', '.cmd', '.ps1', '.sh', '.py', '.c', '.cpp', '.h', '.java', '.rb', '.go', '.rs', '.sql', '.svg', '.gitignore', '.cfg', '.conf']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico']);

async function listDir(dirPath) {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('$')) continue;
    let isDir = e.isDirectory();
    let size = 0;
    let mtime = null;
    try {
      const st = await fsp.stat(path.join(dirPath, e.name));
      isDir = st.isDirectory();
      size = st.size;
      mtime = st.mtimeMs;
    } catch (_) {}
    const ext = path.extname(e.name).toLowerCase();
    let kind = 'other';
    if (isDir) kind = 'folder';
    else if (IMAGE_EXT.has(ext)) kind = 'image';
    else if (TEXT_EXT.has(ext)) kind = 'text';
    else if (ext === '.pdf') kind = 'pdf';
    else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) kind = 'archive';
    else if (['.exe', '.msi'].includes(ext)) kind = 'exe';
    out.push({ name: e.name, isDir, size, mtime, kind });
  }
  out.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

ipcMain.handle('fs:list', async (_e, dirPath) => listDir(dirPath));
ipcMain.handle('fs:home', () => os.homedir());
ipcMain.handle('fs:desktop', () => path.join(os.homedir(), 'Desktop'));
ipcMain.handle('fs:join', (_e, ...parts) => path.join(...parts));
ipcMain.handle('fs:dirname', (_e, p) => path.dirname(p));
ipcMain.handle('fs:basename', (_e, p) => path.basename(p));
ipcMain.handle('fs:sep', () => path.sep);
ipcMain.handle('fs:exists', async (_e, p) => { try { await fsp.access(p); return true; } catch (_) { return false; } });
ipcMain.handle('fs:isDir', async (_e, p) => { try { return (await fsp.stat(p)).isDirectory(); } catch (_) { return false; } });
ipcMain.handle('fs:readText', async (_e, p) => {
  const st = await fsp.stat(p);
  if (st.size > 10 * 1024 * 1024) throw new Error('Файл слишком большой (> 10 МБ)');
  return fsp.readFile(p, 'utf8');
});
ipcMain.handle('fs:writeText', async (_e, p, content) => { await fsp.writeFile(p, content, 'utf8'); return true; });
ipcMain.handle('fs:mkdir', async (_e, p) => { await fsp.mkdir(p, { recursive: true }); return true; });
ipcMain.handle('fs:rename', async (_e, oldP, newP) => { await fsp.rename(oldP, newP); return true; });
ipcMain.handle('fs:delete', async (_e, p) => {
  const res = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['В корзину', 'Удалить навсегда', 'Отмена'],
    defaultId: 0,
    cancelId: 2,
    message: `Удалить «${path.basename(p)}»?`
  });
  if (res.response === 0) { await shell.trashItem(p); return 'trashed'; }
  if (res.response === 1) { await fsp.rm(p, { recursive: true, force: true }); return 'deleted'; }
  return 'cancelled';
});
ipcMain.handle('fs:uniqueName', async (_e, dir, base) => {
  let name = base;
  let i = 2;
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  while (fs.existsSync(path.join(dir, name))) name = `${stem} (${i++})${ext}`;
  return name;
});
ipcMain.handle('fs:isTextFile', (_e, p) => TEXT_EXT.has(path.extname(p).toLowerCase()));
ipcMain.handle('fs:isImageFile', (_e, p) => IMAGE_EXT.has(path.extname(p).toLowerCase()));
ipcMain.handle('fs:knownFolder', (_e, name) => {
  const map = {
    Desktop: 'Desktop', Documents: 'Documents', Downloads: 'Downloads',
    Pictures: 'Pictures', Music: 'Music', Videos: 'Videos'
  };
  if (!(name in map)) throw new Error('Unknown folder');
  return app.getPath(name);
});
ipcMain.handle('fs:drives', () => new Promise((resolve) => {
  if (process.platform !== 'win32') return resolve([{ letter: '/', total: 0, free: 0, label: 'root' }]);
  execFile('wmic', ['logicaldisk', 'get', 'caption,freespace,size,volumename'], { timeout: 5000 }, (err, stdout) => {
    if (err || !stdout) return resolve([{ letter: 'C:', total: 0, free: 0, label: '' }]);
    const drives = [];
    const lines = stdout.trim().split(/\r?\n/);
    for (const line of lines) {
      const m = line.trim().match(/^([A-Z]:)/);
      if (!m) continue;
      const nums = line.match(/(\d{4,})/g) || [];
      let total = 0, free = 0;
      if (nums.length >= 2) { total = Number(nums[nums.length - 1]) || 0; free = Number(nums[nums.length - 2]) || 0; }
      const label = line.trim().replace(/^([A-Z]:)/, '').replace(/\d{4,}/g, '').trim();
      drives.push({ letter: m[1], total, free, label });
    }
    resolve(drives.length ? drives : [{ letter: 'C:', total: 0, free: 0, label: '' }]);
  });
}));

ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
ipcMain.handle('shell:showItem', (_e, p) => { shell.showItemInFolder(p); return true; });
ipcMain.handle('shell:quit', () => { app.quit(); return true; });
ipcMain.handle('shell:clipboardWriteText', (_e, t) => { clipboard.writeText(t); return true; });
ipcMain.handle('shell:clipboardReadText', () => clipboard.readText());

ipcMain.handle('dialog:openFile', async (_e, opts) => {
  const res = await dialog.showOpenDialog(mainWindow, opts || { properties: ['openFile'] });
  return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle('dialog:saveFile', async (_e, opts) => {
  const res = await dialog.showSaveDialog(mainWindow, opts || {});
  return res.canceled ? null : res.filePath;
});
ipcMain.handle('dialog:openImage', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Открыть изображение',
    properties: ['openFile'],
    filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }]
  });
  return res.canceled ? null : res.filePaths[0];
});
