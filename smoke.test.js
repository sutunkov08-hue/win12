const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, 'renderer');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'https://win12.test/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

const fakeHome = { 'Документы': 'dir', 'Загрузки': 'dir', 'Фото.png': 'image', 'заметки.txt': 'text', 'проект': 'dir' };
function fakeList(dir) {
  const clean = dir.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  if (clean === '/home/test' || clean === 'C:/Users/test') return Object.entries(fakeHome).map(([name, kind]) => ({ name, isDir: kind === 'dir', size: kind === 'dir' ? 0 : 42, mtime: Date.now(), kind }));
  throw new Error('ENOENT: ' + clean);
}
window.win12 = {
  fs: {
    list: (p) => Promise.resolve(fakeList(p)),
    home: () => Promise.resolve('/home/test'),
    desktop: () => Promise.resolve('/home/test/Рабочий стол'),
    join: (...a) => Promise.resolve(a.join('/').replace(/\/+/g, '/')),
    dirname: (p) => Promise.resolve(p.split('/').slice(0, -1).join('/') || '/'),
    basename: (p) => Promise.resolve(p.split('/').pop()),
    sep: () => Promise.resolve('/'),
    exists: () => Promise.resolve(false),
    isDir: (p) => Promise.resolve(p.endsWith('проект') || p.endsWith('Документы') || p.endsWith('Загрузки')),
    readText: () => Promise.resolve('hello'),
    writeText: () => Promise.resolve(true),
    mkdir: () => Promise.resolve(true),
    rename: () => Promise.resolve(true),
    delete: () => Promise.resolve('trashed'),
    uniqueName: (d, b) => Promise.resolve(b),
    isTextFile: () => Promise.resolve(true),
    isImageFile: () => Promise.resolve(true),
    knownFolder: (n) => Promise.resolve('/home/test/Документы'),
    drives: () => Promise.resolve([{ letter: 'C:', total: 100, free: 40, label: 'System' }])
  },
  shell: { openPath: async () => '', showItem: async () => true, quit: async () => {}, clipboardWriteText: async () => {}, clipboardReadText: async () => '' },
  dialog: { openFile: async () => null, saveFile: async () => null, openImage: async () => null }
};

process.on("unhandledRejection", (r) => console.log("UNHANDLED:", (r && r.stack) || String(r)));
const errors = [];
window.onerror = (msg) => { errors.push('onerror: ' + msg); };
window.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message));

const combined = fs.readFileSync(path.join(root, 'apps.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'app.js'), 'utf8');

(async () => {
  try {
    window.eval(combined + '\nwindow.__test = { openStart, openApp, closeStart, WM, APPS };');
  } catch (e) { errors.push('eval: ' + e.message); }
  await new Promise((r) => setTimeout(r, 1200));

  const checks = [];
  checks.push(['taskbar exists', !!document.getElementById('taskbar')]);
  checks.push(['explorer window opened', document.querySelectorAll('.window').length >= 1]);
  checks.push(['explorer tab rendered', !!document.querySelector('.ex-tab')]);
  checks.push(['explorer shows fake home files', document.querySelectorAll('.ex-cell').length >= 4]);
  checks.push(['sidebar has items', document.querySelectorAll('.ex-sb-item').length >= 5]);
  checks.push(['desktop icons built', document.querySelectorAll('.desk-icon').length >= 5]);

  window.__test.openStart();
  await new Promise((r) => setTimeout(r, 500));
  checks.push(['start menu opens', document.getElementById('start-menu').classList.contains('open')]);
  checks.push(['start pins added', document.querySelectorAll('#start-pinned .pin').length >= 6]);
  window.__test.closeStart();
  window.__test.openApp('calc');
  window.__test.openApp('terminal');
  window.__test.openApp('settings');
  window.__test.openApp('notepad');
  window.__test.openApp('about');
  await new Promise((r) => setTimeout(r, 600));
  checks.push(['windows opened in total', document.querySelectorAll('.window').length >= 6]);
  checks.push(['calculator buttons ok', document.body.querySelectorAll('.calc-btn').length >= 20]);
  checks.push(['terminal input ok', !!document.body.querySelector('.term-in')]);
  checks.push(['settings cards ok', document.body.querySelectorAll('.set-card').length >= 3]);
  checks.push(['notepad textarea ok', !!document.body.querySelector('.np-text')]);
  checks.push(['about ok', !!document.body.querySelector('.about')]);
  checks.push(['taskbar running buttons', document.querySelectorAll('#tb-apps .tb-app').length >= 5]);

  let fail = 0;
  for (const [name, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fail++; }
  for (const e of errors.slice(0, 20)) console.log('ERROR ' + e);
  console.log(errors.length ? 'TOTAL RUNTIME ERRORS: ' + errors.length : 'NO RUNTIME ERRORS');
  process.exit(fail || errors.length ? 1 : 0);
})();
