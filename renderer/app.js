const Store = {
  get() { try { return JSON.parse(localStorage.getItem('win12.settings') || '{}'); } catch (_) { return {}; } },
  set(v) { try { localStorage.setItem('win12.settings', JSON.stringify(v)); } catch (_) {} }
};

const WM = (() => {
  const layer = document.getElementById('windows-layer');
  const desktop = document.getElementById('desktop');
  let z = 10;
  let focused = null;
  const openWins = new Set();

  function createWindow(opts = {}) {
    const w = Math.min(opts.w || 900, window.innerWidth - 40);
    const h = Math.min(opts.h || 600, window.innerHeight - 80);
    const x = Math.max(10, (window.innerWidth - w) / 2 + (openWins.size % 6) * 26 - 60);
    const y = Math.max(10, (window.innerHeight - h) / 2 - 30 + (openWins.size % 6) * 20);

    const winEl = el('div', 'window');
    winEl.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${++z}`;
    winEl.innerHTML = `
      <div class="titlebar">
        <span class="tb-icon glyph"></span>
        <span class="tb-title">Окно</span>
        <button class="win-btn min">&#xE921;</button>
        <button class="win-btn max">&#xE922;</button>
        <button class="win-btn close">&#xE711;</button>
      </div>
      <div class="window-body"></div>
      ${['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].map((d) => `<div class="rz rz-${d}" data-dir="${d}"></div>`).join('')}`;

    layer.appendChild(winEl);
    requestAnimationFrame(() => winEl.classList.add('shown'));

    const api = {
      el: winEl,
      body: winEl.querySelector('.window-body'),
      setTitle(t) { winEl.querySelector('.tb-title').textContent = t; taskbarUpdate(api); },
      setIcon(g) { winEl.querySelector('.tb-icon').innerHTML = g + ';'; },
      close() {
        winEl.classList.add('minimizing');
        setTimeout(() => winEl.remove(), 130);
        openWins.delete(api);
        taskbarRemove(api);
        if (focused === api) focused = null;
      },
      focus() {
        winEl.style.zIndex = ++z;
        if (focused) focused.el.classList.remove('focused');
        focused = api;
        winEl.classList.add('focused');
        taskbarUpdate(api);
      },
      minimize() {
        winEl.classList.add('minimizing');
        setTimeout(() => { winEl.style.display = 'none'; winEl.classList.remove('minimizing'); api._min = true; taskbarUpdate(api); }, 120);
        if (focused === api) focused = null;
      },
      restore() {
        api._min = false;
        winEl.style.display = '';
        requestAnimationFrame(() => winEl.classList.remove('minimizing'));
        api.focus();
      },
      toggleMin() { if (api._min) api.restore(); else if (focused === api) api.minimize(); else api.focus(); },
      get minimized() { return !!api._min; },
      _appId: opts.appId || null
    };

    winEl.addEventListener('mousedown', () => api.focus());

    winEl.querySelector('.win-btn.min').onclick = (e) => { e.stopPropagation(); api.minimize(); };
    winEl.querySelector('.win-btn.close').onclick = (e) => { e.stopPropagation(); api.close(); };
    winEl.querySelector('.win-btn.max').onclick = (e) => { e.stopPropagation(); toggleMax(); };

    function toggleMax() {
      const tb = winEl.querySelector('.win-btn.max');
      if (winEl.dataset.max) {
        winEl.style.cssText = winEl.dataset.max;
        delete winEl.dataset.max;
        tb.innerHTML = '&#xE922;';
      } else {
        winEl.dataset.max = winEl.style.cssText;
        winEl.style.cssText = 'left:0;top:0;width:100%;height:100%;border-radius:0;z-index:' + winEl.style.zIndex;
        tb.innerHTML = '&#xE923;';
      }
      taskbarUpdate(api);
    }
    api.toggleMax = toggleMax;

    const tbEl = winEl.querySelector('.titlebar');
    let drag = null;
    tbEl.addEventListener('dblclick', toggleMax);
    tbEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.win-btn') || winEl.dataset.max) return;
      const rect = winEl.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false };
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const nx = e.clientX - drag.dx;
      const ny = Math.max(0, e.clientY - drag.dy);
      winEl.style.left = nx + 'px';
      winEl.style.top = ny + 'px';
      drag.moved = true;
      if (e.clientY <= 2) showSnap('max');
      else if (e.clientX <= 2) showSnap('left');
      else if (e.clientX >= window.innerWidth - 2) showSnap('right');
      else hideSnap();
    });
    window.addEventListener('mouseup', () => {
      if (!drag) return;
      const preview = document.getElementById('snap-preview').dataset.snap;
      if (preview === 'max') { if (!winEl.dataset.max) toggleMax(); }
      else if (preview === 'left' || preview === 'right') {
        if (!winEl.dataset.max) winEl.dataset.max = winEl.style.cssText;
        winEl.style.cssText = (preview === 'left' ? 'left:0;top:0;width:50%;' : 'left:50%;top:0;width:50%;') + `height:100%;border-radius:0;z-index:${z}`;
      }
      hideSnap();
      drag = null;
    });

    function showSnap(mode) {
      const p = document.getElementById('snap-preview');
      p.dataset.snap = mode;
      p.style.display = 'block';
      if (mode === 'max') p.style.cssText = 'left:6px;top:6px;right:6px;bottom:6px;display:block';
      if (mode === 'left') p.style.cssText = 'left:6px;top:6px;right:50%;bottom:6px;display:block';
      if (mode === 'right') p.style.cssText = 'left:50%;top:6px;right:6px;bottom:6px;display:block';
    }
    function hideSnap() { document.getElementById('snap-preview').style.display = 'none'; delete document.getElementById('snap-preview').dataset.snap; }

    winEl.querySelectorAll('.rz').forEach((h) => {
      h.addEventListener('mousedown', (e) => {
        e.preventDefault();
        api.focus();
        const dir = h.dataset.dir;
        const rect = winEl.getBoundingClientRect();
        const start = { x: e.clientX, y: e.clientY, l: rect.left, t: rect.top, w: rect.width, h: rect.height };
        const move = (ev) => {
          const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
          if (dir.includes('e')) winEl.style.width = Math.max(320, start.w + dx) + 'px';
          if (dir.includes('s')) winEl.style.height = Math.max(200, start.h + dy) + 'px';
          if (dir.includes('w')) { const nw = Math.max(320, start.w - dx); winEl.style.width = nw + 'px'; winEl.style.left = start.l + (start.w - nw) + 'px'; }
          if (dir.includes('n')) { const nh = Math.max(200, start.h - dy); winEl.style.height = nh + 'px'; winEl.style.top = Math.max(0, start.t + (start.h - nh)) + 'px'; }
        };
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });
    });

    openWins.add(api);
    api.focus();
    return api;
  }

  function taskbarUpdate(api) {
    document.querySelectorAll('#tb-apps .tb-app').forEach((b) => { if (b._bind === api) b.remove(); });
    const btn = el('button', 'tb-btn tb-app' + (focused === api && !api.minimized ? ' active' : '') + ' running');
    btn.innerHTML = `<span class="glyph">${(APPS[api._appId] || { glyph: '&#xE7C3;' }).glyph}</span>`;
    btn.title = api.el.querySelector('.tb-title').textContent;
    btn._bind = api;
    btn.onclick = () => api.toggleMin();
    document.getElementById('tb-apps').appendChild(btn);
  }

  function taskbarRemove(api) {
    document.querySelectorAll('#tb-apps .tb-app').forEach((b) => { if (b._bind === api) b.remove(); });
  }

  return { createWindow, get focused() { return focused; } };
})();

function showTooltip(target, text) {
  document.querySelectorAll('.tooltip').forEach((t) => t.remove());
  const t = el('div', 'tooltip', esc(text));
  document.body.appendChild(t);
  const r = target.getBoundingClientRect();
  t.style.left = r.left + 'px';
  t.style.top = (r.top - 34) + 'px';
  setTimeout(() => t.remove(), 1200);
}

function showContextMenu(x, y, items) {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = '';
  for (const item of items) {
    if (item.sep) { menu.appendChild(el('div', 'ctx-sep')); continue; }
    const b = el('button', 'ctx-item' + (item.danger ? ' danger' : ''), `<span class="glyph">${item.icon}</span> ${esc(item.label)}`);
    if (item.disabled) b.style.opacity = 0.4, b.disabled = true;
    b.onclick = () => { hideContextMenu(); item.action(); };
    menu.appendChild(b);
  }
  menu.style.display = 'block';
  menu.classList.add('show');
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - mh - 8 - 48) + 'px';
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  menu.classList.remove('show');
  menu.style.display = 'none';
}

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#context-menu')) hideContextMenu();
  if (!e.target.closest('#start-menu') && !e.target.closest('#btn-start')) closeStart();
  if (!e.target.closest('.desk-icon') && !e.target.closest('.ex-content')) document.querySelectorAll('.desk-icon.selected').forEach((d) => d.classList.remove('selected'));
});

function openApp(id, arg) {
  const app = APPS[id];
  if (!app) return null;
  const win = WM.createWindow({ w: app.size?.w || 900, h: app.size?.h || 600, appId: id });
  app.launch(win, arg);
  return win;
}

const Clock = () => {
  const tick = () => {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    document.getElementById('tb-time').textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
    document.getElementById('tb-date').textContent = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  };
  tick();
  setInterval(tick, 1000);
};

const startMenu = document.getElementById('start-menu');

async function buildStart() {
  const pinned = document.getElementById('start-pinned');
  pinned.innerHTML = '';
  ['explorer', 'notepad', 'calc', 'terminal', 'settings', 'photos', 'about'].forEach((id) => {
    const a = APPS[id];
    if (!a) return;
    const b = el('button', 'pin', `<span class="glyph">${a.glyph}</span><span class="pin-name">${esc(a.name)}</span>`);
    b.onclick = () => { closeStart(); openApp(id); };
    pinned.appendChild(b);
  });
  const reco = document.getElementById('start-recommended');
  reco.innerHTML = '';
  try {
    const home = await win12.fs.home();
    const desk = await win12.fs.knownFolder('Desktop').catch(() => null) || await win12.fs.join(home, 'Desktop');
    const recents = [];
    for (const dir of await Promise.all([desk, await win12.fs.knownFolder('Downloads').catch(() => desk), await win12.fs.knownFolder('Documents').catch(() => desk)])) {
      try {
        const items = (await win12.fs.list(dir)).filter((i) => !i.isDir).sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 3);
        items.forEach((i) => recents.push({ name: i.name, path: dir + (dir.endsWith('\\') || dir.endsWith('/') ? '' : (i.name, '')), item: i, dir }));
      } catch (_) {}
    }
    recents.slice(0, 6).forEach((r) => {
      const b = el('button', 'reco', `<span class="glyph">${r.item.kind === 'image' ? '&#xEB9F;' : '&#xE8A5;'}</span><span class="reco-text"><span class="reco-name">${esc(r.item.name)}</span><span class="reco-sub">${esc(r.dir.split(/[\\/]/).pop())}</span></span>`);
      b.onclick = () => { closeStart(); openItemPath(r.dir, r.item); };
      reco.appendChild(b);
    });
  } catch (_) {}
  try {
    const username = (await win12.fs.home()).split(/[\\/]/).pop();
    document.getElementById('start-username').textContent = username;
  } catch (_) {}
}

async function openItemPath(dir, item) {
  const p = await win12.fs.join(dir, item.name);
  if (item.kind === 'text') APPS.notepad.launch(WM.createWindow({ w: 700, h: 520, appId: 'notepad' }), p);
  else if (item.kind === 'image') APPS.photos.launch(WM.createWindow({ w: 760, h: 560, appId: 'photos' }), p);
  else win12.shell.openPath(p);
}

function openStart() {
  startMenu.classList.add('open');
  document.getElementById('btn-start').classList.add('open');
  document.getElementById('start-search').value = '';
  document.getElementById('start-search').focus();
  buildStart();
}

function closeStart() {
  startMenu.classList.remove('open');
  document.getElementById('btn-start').classList.remove('open');
}

document.getElementById('btn-start').onclick = (e) => {
  e.stopPropagation();
  startMenu.classList.contains('open') ? closeStart() : openStart();
};
document.getElementById('btn-search').onclick = () => { openStart(); };
document.getElementById('btn-taskview').onclick = () => {
  const wins = [...document.querySelectorAll('#windows-layer .window')];
  if (!wins.length) return;
  wins.forEach((w) => { w.style.display = ''; });
  wins.forEach((w) => { w.style.transition = 'transform .15s'; w.style.transform = w.style.transform ? '' : 'scale(.92)'; });
};
document.getElementById('start-power').onclick = () => {
  closeStart();
  showContextMenu(window.innerWidth / 2 - 80, window.innerHeight - 240, [
    { icon: '&#xE7E8;', label: 'Завершить работу', action: () => win12.shell.quit() },
    { icon: '&#xE777;', label: 'Перезапуск', action: () => location.reload() }
  ]);
};
document.getElementById('start-search').addEventListener('input', async (e) => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#start-pinned .pin').forEach((p) => {
    p.style.display = !q || p.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
  document.querySelector('.sm-allapps').style.display = q ? 'none' : '';
});
document.getElementById('start-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = [...document.querySelectorAll('#start-pinned .pin')].find((p) => p.style.display !== 'none');
    if (first) first.click();
  }
  e.stopPropagation();
});

async function buildDesktopIcons() {
  const wrap = document.getElementById('desktop-icons');
  wrap.innerHTML = '';
  const icons = [
    { id: 'explorer', name: 'Проводник', glyph: '&#xE8B7;' },
    { id: 'notepad', name: 'Блокнот', glyph: '&#xE70B;' },
    { id: 'settings', name: 'Параметры', glyph: '&#xE713;' },
    { id: 'terminal', name: 'Терминал', glyph: '&#xE756;' },
    { id: 'about', name: 'О системе', glyph: '&#xE946;' }
  ];
  for (const ic of icons) {
    const d = el('div', 'desk-icon', `<span class="di-icon glyph">${ic.glyph}</span><span class="di-label">${esc(ic.name)}</span>`);
    d.ondblclick = () => openApp(ic.id);
    d.onclick = () => { document.querySelectorAll('.desk-icon.selected').forEach((x) => x.classList.remove('selected')); d.classList.add('selected'); };
    wrap.appendChild(d);
  }
  try {
    const home = await win12.fs.home();
    const recycles = ['Recycle Bin', 'Корзина'].map((n) => home + (home.includes('\\') ? '\\' + n : '/' + n));
    if (await win12.fs.exists(recycles[0]) || await win12.fs.exists(recycles[1])) return;
  } catch (_) {}
}

document.getElementById('desktop').addEventListener('contextmenu', (e) => {
  if (e.target.closest('.window') || e.target.closest('#taskbar') || e.target.closest('#start-menu') || e.target.closest('#context-menu')) return;
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, [
    { icon: '&#xE72C;', label: 'Обновить', action: () => buildDesktopIcons() },
    { sep: true },
    { icon: '&#xE713;', label: 'Персонализация', action: () => openApp('settings') },
    { icon: '&#xE77B;', label: 'Открыть в терминале', action: () => openApp('terminal') }
  ]);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Meta' || (e.ctrlKey && e.key === 'Escape')) { startMenu.classList.contains('open') ? closeStart() : openStart(); e.preventDefault(); }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') { openApp('explorer'); e.preventDefault(); }
  if (e.key === 'Escape') { closeStart(); hideContextMenu(); }
});

async function boot() {
  const saved = Store.get();
  if (saved.theme === 'light') document.body.classList.add('light');
  if (saved.accent) {
    document.documentElement.style.setProperty('--accent', saved.accent);
    const r = parseInt(saved.accent.slice(1, 3), 16), g = parseInt(saved.accent.slice(3, 5), 16), b = parseInt(saved.accent.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.3)`);
  }
  Clock();
  buildDesktopIcons();
  const wallpaper = document.getElementById('wallpaper');
  wallpaper.style.background = 'linear-gradient(135deg,#0f2027 0%,#203a43 30%,#2c5364 60%,#1a2a4f 100%)';
  if (saved.wallpaper) wallpaper.style.background = saved.wallpaper.startsWith('url') || saved.wallpaper.includes('gradient') ? saved.wallpaper : wallpaper.style.background;
  try {
    const home = await win12.fs.home();
    APPS.explorer.launch(WM.createWindow({ w: 980, h: 620, appId: 'explorer' }), home);
  } catch (_) {}
}

boot();
