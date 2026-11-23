const APPS = {};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmtSize(n) {
  if (n < 1024) return n + ' Б';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' КБ';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' МБ';
  return (n / 1073741824).toFixed(1) + ' ГБ';
}

function fmtDate(ms) {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

APPS.explorer = {
  id: 'explorer',
  name: 'Проводник',
  glyph: '&#xE8B7;',
  multiple: true,
  async launch(win, arg) {
    const home = await win12.fs.home();
    const sep = await win12.fs.sep();
    const state = {
      tabs: [],
      activeTab: 0,
      clipboard: null,
      view: 'icons'
    };
    win.body.classList.add('explorer-app');
    win.body.innerHTML = `
      <div class="ex-tabs"><div class="ex-tablist"></div><button class="tb-glyph ex-newtab" title="Новая вкладка">&#xE710;</button></div>
      <div class="ex-toolbar">
        <button class="tb-glyph ex-nav ex-back" title="Назад">&#xE72B;</button>
        <button class="tb-glyph ex-nav ex-fwd" title="Вперёд">&#xE72A;</button>
        <button class="tb-glyph ex-nav ex-up" title="Вверх">&#xE74A;</button>
        <button class="tb-glyph ex-nav ex-refresh" title="Обновить">&#xE72C;</button>
        <div class="ex-address"></div>
        <input class="ex-search" type="text" placeholder="Поиск">
        <button class="tb-glyph ex-view" title="Вид">&#xE8A9;</button>
      </div>
      <div class="ex-main">
        <div class="ex-sidebar"></div>
        <div class="ex-content" tabindex="0"></div>
      </div>
      <div class="ex-status"><span class="ex-count"></span><span class="ex-selinfo"></span></div>`;
    const q = (s) => win.body.querySelector(s);
    const tablist = q('.ex-tablist');
    const content = q('.ex-content');
    const sidebar = q('.ex-sidebar');
    const address = q('.ex-address');
    const searchInput = q('.ex-search');

    win.body._tabAPI = {
      openInTab: (p) => { newTab(p); },
      navigate: (p) => currentTab().history.push(p)
    };

    function newTab(p) {
      const tab = { history: [p], hIndex: 0, selection: new Set(), renameName: null };
      state.tabs.push(tab);
      state.activeTab = state.tabs.length - 1;
      renderTabs();
      navigate(p);
      activateTab(state.tabs.length - 1);
    }
    function currentTab() { return state.tabs[state.activeTab]; }
    function curPath() { return currentTab().history[currentTab().hIndex]; }

    function renderTabs() {
      tablist.innerHTML = '';
      state.tabs.forEach((t, i) => {
        const tabBtn = el('button', 'ex-tab' + (i === state.activeTab ? ' active' : ''),
          `<span class="glyph">&#xE8B7;</span><span class="ex-tab-name">${esc(tabName(t.history[t.hIndex]))}</span><span class="ex-tab-close glyph">&#xE711;</span>`);
        tabBtn.onclick = (e) => {
          if (e.target.classList.contains('ex-tab-close')) {
            state.tabs.splice(i, 1);
            if (!state.tabs.length) return win.close();
            state.activeTab = Math.min(state.activeTab, state.tabs.length - 1);
            renderTabs(); renderSidebar(); refresh();
          } else activateTab(i);
        };
        tablist.appendChild(tabBtn);
      });
    }

    async function activateTab(i) {
      state.activeTab = i;
      renderTabs();
      await refresh();
    }

    async function navigate(p) {
      const t = currentTab();
      t.history = t.history.slice(0, t.hIndex + 1);
      if (t.history[t.hIndex] !== p) t.history.push(p);
      t.hIndex = t.history.length - 1;
      t.selection.clear();
      await refresh();
    }

    async function refresh() {
      const p = curPath();
      q('.ex-back').disabled = currentTab().hIndex === 0;
      q('.ex-fwd').disabled = currentTab().hIndex >= currentTab().history.length - 1;
      const upPath = await win12.fs.dirname(p);
      q('.ex-up').disabled = upPath === p;
      win.setTitle(tabName(p));
      renderAddress(p);
      let items = [];
      try { items = await win12.fs.list(p); } catch (err) { items = []; }
      const filter = searchInput.value.trim().toLowerCase();
      if (filter) items = items.filter((i) => i.name.toLowerCase().includes(filter));
      await renderItems(items, p);
    }

    function renderAddress(p) {
      address.innerHTML = '';
      const parts = p.split(/[\\/]/).filter(Boolean);
      address.appendChild(el('span', 'glyph ex-pc-glyph', '&#xE7F8;'));
      parts.forEach((part, i) => {
        const crumb = el('button', 'ex-crumb', esc(part));
        const partial = parts.slice(0, i + 1).join(sep) || sep;
        crumb.onclick = () => navigate(/^([a-zA-Z]:)$/.test(partial) ? partial + sep : partial);
        address.appendChild(crumb);
        if (i < parts.length - 1) address.appendChild(el('span', 'ex-crumb-sep glyph', '&#xE76C;'));
      });
    }

    function updateStatus(total) {
      q('.ex-count').textContent = `Элементов: ${total}`;
      const sel = currentTab().selection.size;
      q('.ex-selinfo').textContent = sel ? `Выбрано: ${sel}` : '';
      const c = q('.ex-count'), s = q('.ex-selinfo');
      c.style.display = c.textContent ? 'inline' : 'none';
      s.style.display = s.textContent ? 'inline' : 'none';
    }

    async function renderItems(items, dir) {
      content.innerHTML = '';
      content.classList.toggle('list-mode', state.view === 'list');
      for (const item of items) {
        const cell = el('div', 'ex-cell');
        const glyph = item.isDir ? '&#xE8B7;'
          : item.kind === 'image' ? '&#xEB9F;'
          : item.kind === 'text' ? '&#xE8A5;'
          : item.kind === 'archive' ? '&#xE8B7;'
          : item.kind === 'exe' ? '&#xE7E8;'
          : '&#xE8A5;';
        cell.innerHTML = `<span class="ex-icon glyph">${glyph}</span><span class="ex-name"></span>`;
        cell.querySelector('.ex-name').textContent = item.name;
        cell._item = item;
        cell._dir = dir;
        if (state.clipboard && state.clipboard.mode === 'cut' && state.clipboard.src === pathJoin(dir, item.name)) cell.classList.add('cut');
        cell.onclick = (e) => {
          if (!e.ctrlKey) { content.querySelectorAll('.selected').forEach((s) => s.classList.remove('selected')); currentTab().selection.clear(); }
          cell.classList.add('selected');
          currentTab().selection.add(item.name);
          updateStatus(items.length);
        };
        cell.oncontextmenu = (e) => {
          e.preventDefault(); e.stopPropagation();
          if (!cell.classList.contains('selected')) { content.querySelectorAll('.selected').forEach((s) => s.classList.remove('selected')); currentTab().selection.clear(); cell.classList.add('selected'); currentTab().selection.add(item.name); }
          showItemMenu(e, dir);
        };
        cell.ondblclick = () => openItem(dir, item);
        content.appendChild(cell);
      }
      updateStatus(items.length);
      content.oncontextmenu = (e) => {
        if (e.target !== content && !e.target.classList.contains('ex-content')) return;
        e.preventDefault();
        showEmptyMenu(e, dir);
      };
      content.onkeydown = (e) => {
        if (e.key === 'F2' && currentTab().selection.size === 1) beginRename([...currentTab().selection][0]);
        if (e.key === 'Delete' && currentTab().selection.size) delSelected();
      };
      content.focus();
    }

    function pathJoin(dir, name) { return dir.endsWith(sep) ? dir + name : dir + sep + name; }

    async function openItem(dir, item) {
      const p = pathJoin(dir, item.name);
      if (item.isDir) return navigate(p);
      if (item.kind === 'text') return APPS.notepad.launch(WM.createWindow({ w: 700, h: 520 }), p);
      if (item.kind === 'image') return APPS.photos.launch(WM.createWindow({ w: 760, h: 560 }), p);
      win12.shell.openPath(p);
    }

    function selectedPaths() {
      const dir = curPath();
      return [...currentTab().selection].map((n) => pathJoin(dir, n));
    }

    async function delSelected() {
      const paths = selectedPaths();
      for (const p of paths) {
        const res = await win12.fs.delete(p);
        if (res === 'cancelled') break;
      }
      currentTab().selection.clear();
      refresh();
    }

    async function beginRename(name) {
      const dir = curPath();
      const cell = [...content.children].find((c) => c._item && c._item.name === name);
      if (!cell) return;
      const nameSpan = cell.querySelector('.ex-name');
      const input = document.createElement('input');
      input.value = name;
      input.className = 'ex-rename';
      nameSpan.replaceWith(input);
      input.focus();
      const dot = name.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : name.length);
      const commit = async (ok) => {
        const newName = input.value.trim();
        if (ok && newName && newName !== name) {
          try { await win12.fs.rename(pathJoin(dir, name), pathJoin(dir, newName)); } catch (err) { alert('Не удалось переименовать: ' + err.message); }
        }
        refresh();
      };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') commit(true);
        if (e.key === 'Escape') commit(false);
        e.stopPropagation();
      };
      input.onblur = () => commit(true);
    }

    async function paste(dir) {
      if (!state.clipboard) return;
      for (const src of state.clipboard.paths) {
        const name = await win12.fs.basename(src);
        const target = pathJoin(dir, await win12.fs.uniqueName(dir, name));
        await copyEntry(src, target, state.clipboard.mode === 'cut');
      }
      if (state.clipboard.mode === 'cut') state.clipboard = null;
      refresh();
    }

    async function copyEntry(src, dst, move) {
      const isDir = await win12.fs.isDir(src);
      if (isDir) {
        await win12.fs.mkdir(dst);
        const entries = await win12.fs.list(src);
        for (const e of entries) await copyEntry(src.endsWith(sep) ? src + e.name : src + sep + e.name, dst + sep + e.name, move);
        if (move) await win12.fs.delete(src);
      } else {
        const data = await win12.fs.readText(src);
        await win12.fs.writeText(dst, data);
        if (move) await win12.fs.delete(src);
      }
    }

    async function newFolder(dir) {
      const name = await win12.fs.uniqueName(dir, 'Новая папка');
      await win12.fs.mkdir(pathJoin(dir, name));
      refresh();
    }

    function showEmptyMenu(e, dir) {
      showContextMenu(e.clientX, e.clientY, [
        { icon: '&#xE8F4;', label: 'Создать папку', action: () => newFolder(dir) },
        { icon: '&#xE77F;', label: 'Вставить', action: () => paste(dir), disabled: !state.clipboard },
        { sep: true },
        { icon: '&#xE72C;', label: 'Обновить', action: refresh }
      ]);
    }

    function showItemMenu(e, dir) {
      if (currentTab().selection.size > 1) {
        showContextMenu(e.clientX, e.clientY, [
          { icon: '&#xE8C8;', label: `Копировать (${currentTab().selection.size})`, action: () => { state.clipboard = { mode: 'copy', paths: selectedPaths() }; } },
          { icon: '&#xE8C6;', label: 'Вырезать', action: () => { state.clipboard = { mode: 'cut', paths: selectedPaths() }; refresh(); } },
          { sep: true },
          { icon: '&#xE74D;', label: 'Удалить', action: delSelected, danger: true }
        ]);
        return;
      }
      const name = [...currentTab().selection][0];
      const item = [...content.children].find((c) => c._item && c._item.name === name)?._item;
      if (!item) return;
      const p = pathJoin(dir, name);
      showContextMenu(e.clientX, e.clientY, [
        ...(!item.isDir ? [{ icon: '&#xE7C3;', label: 'Открыть', action: () => win12.shell.openPath(p) }] : []),
        { icon: '&#xE8C8;', label: 'Копировать', action: () => { state.clipboard = { mode: 'copy', paths: [p] }; } },
        { icon: '&#xE8C6;', label: 'Вырезать', action: () => { state.clipboard = { mode: 'cut', paths: [p] }; refresh(); } },
        { icon: '&#xE77F;', label: 'Вставить', action: () => paste(p), disabled: !state.clipboard || !item.isDir },
        { sep: true },
        { icon: '&#xE8AC;', label: 'Переименовать', action: () => beginRename(name) },
        { icon: '&#xE72D;', label: 'Показать в папке', action: () => win12.shell.showItem(p) },
        { sep: true },
        { icon: '&#xE74D;', label: 'Удалить', action: delSelected, danger: true }
      ]);
    }

    async function renderSidebar() {
      const folders = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos'];
      sidebar.innerHTML = `<button data-p="${esc(home)}" class="ex-sb-item"><span class="glyph">&#xE80F;</span> Главная</button>`;
      for (const f of folders) {
        try {
          const p = await win12.fs.knownFolder(f);
          if (!p) continue;
          const icon = { Desktop: '&#xE8B9;', Documents: '&#xE8A5;', Downloads: '&#xE896;', Pictures: '&#xEB9F;', Music: '&#xE8D6;', Videos: '&#xE8B2;' }[f];
          const label = { Desktop: 'Рабочий стол', Documents: 'Документы', Downloads: 'Загрузки', Pictures: 'Изображения', Music: 'Музыка', Videos: 'Видео' }[f];
          sidebar.appendChild(el('button', 'ex-sb-item', `<span class="glyph">${icon}</span> ${label}`)).onclick = () => navigate(p);
        } catch (_) {}
      }
      const pcBtn = sidebar.appendChild(el('button', 'ex-sb-item', '<span class="glyph">&#xE7F8;</span> Этот компьютер'));
      pcBtn.onclick = () => showPC();
      const drives = await win12.fs.drives();
      const drivesWrap = el('div', 'ex-drives');
      for (const d of drives) {
        const btn = el('button', 'ex-sb-item', `<span class="glyph">&#xE7F8;</span> ${esc(d.letter)} ${esc(d.label || 'Локальный диск')}`);
        btn.onclick = () => navigate(d.letter.endsWith(':') ? d.letter + sep : d.letter);
        drivesWrap.appendChild(btn);
      }
      sidebar.appendChild(drivesWrap);
      sidebar.querySelectorAll('.ex-sb-item')[0].onclick = () => navigate(home);
    }

    async function showPC() {
      currentTab().history = currentTab().history.slice(0, currentTab().hIndex + 1);
      currentTab().history.push('__THIS_PC__');
      currentTab().hIndex++;
      content.innerHTML = '';
      win.setTitle('Этот компьютер');
      address.innerHTML = '<span class="glyph ex-pc-glyph">&#xE7F8;</span><button class="ex-crumb">Этот компьютер</button>';
      const drives = await win12.fs.drives();
      const grid = el('div', 'ex-pc-grid');
      for (const d of drives) {
        const total = d.total || 0, free = d.free || 0;
        const used = total ? (total - free) / total : 0;
        const card = el('div', 'ex-drive');
        card.innerHTML = `<span class="glyph ex-drive-icon">&#xE7F8;</span>
          <div class="ex-drive-info"><b>${esc(d.letter)} ${esc(d.label || 'Локальный диск')}</b>
          <div class="ex-drive-bar"><div style="width:${Math.round(used * 100)}%"></div></div>
          <span class="ex-drive-free">${free ? fmtSize(free) + ' свободно из ' + fmtSize(total) : ''}</span></div>`;
        card.ondblclick = () => navigate(d.letter.endsWith(':') ? d.letter + sep : d.letter);
        grid.appendChild(card);
      }
      content.appendChild(grid);
    }

    q('.ex-back').onclick = () => { if (currentTab().hIndex > 0) { currentTab().hIndex--; refresh(); } };
    q('.ex-fwd').onclick = () => { if (currentTab().hIndex < currentTab().history.length - 1) { currentTab().hIndex++; refresh(); } };
    q('.ex-up').onclick = async () => { const up = await win12.fs.dirname(curPath()); if (up !== curPath()) navigate(up); };
    q('.ex-refresh').onclick = refresh;
    q('.ex-view').onclick = (e) => {
      state.view = state.view === 'icons' ? 'list' : 'icons';
      refresh();
      showTooltip(e.currentTarget, state.view === 'icons' ? 'Крупные значки' : 'Список');
    };
    q('.ex-newtab').onclick = () => newTab(home);
    searchInput.oninput = () => refresh();
    searchInput.onkeydown = (e) => e.stopPropagation();

    await newTab(arg || home);
    await renderSidebar();
  }
};

function tabName(p) {
  if (p === '__THIS_PC__') return 'Этот компьютер';
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (!parts.length) return 'Этот компьютер';
  if (/^[a-zA-Z]:$/.test(parts[0])) return parts.join('\\');
  return parts[parts.length - 1] || '/';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

APPS.notepad = {
  id: 'notepad',
  name: 'Блокнот',
  glyph: '&#xE70B;',
  multiple: true,
  async launch(win, filePath) {
    let path = filePath || null;
    let dirty = false;
    win.body.innerHTML = `
      <div class="np-menu">
        <button class="np-file new">Создать</button>
        <button class="np-file open">Открыть</button>
        <button class="np-file save">Сохранить</button>
        <button class="np-file saveas">Сохранить как…</button>
      </div>
      <textarea class="np-text" spellcheck="false" placeholder="Введите текст…"></textarea>
      <div class="np-status"><span class="np-path"></span><span class="np-info"></span></div>`;
    const q = (s) => win.body.querySelector(s);
    const text = q('.np-text');
    const pathEl = q('.np-path');

    function updateTitle() {
      const base = path ? path.split(/[\\/]/).pop() : 'Безымянный';
      win.setTitle((dirty ? '*' : '') + base + ' — Блокнот');
      pathEl.textContent = path || '';
    }
    function markDirty() { if (!dirty) { dirty = true; updateTitle(); } q('.np-info').textContent = `Строк: ${text.value.split('\n').length}, симв.: ${text.value.length}`; }
    text.addEventListener('input', markDirty);

    async function load(p) {
      try { text.value = await win12.fs.readText(p); path = p; dirty = false; updateTitle(); markDirty(); }
      catch (err) { alert('Не удалось открыть файл: ' + err.message); }
    }
    async function save(as) {
      let target = path;
      if (!target || as) {
        target = await win12.dialog.saveFile({
          title: 'Сохранить как',
          defaultPath: path || 'Безымянный.txt',
          filters: [{ name: 'Текстовые файлы', extensions: ['txt', 'md', 'log', 'json', 'js', 'html', 'css'] }, { name: 'Все файлы', extensions: ['*'] }]
        });
        if (!target) return false;
      }
      try { await win12.fs.writeText(target, text.value); path = target; dirty = false; updateTitle(); return true; }
      catch (err) { alert('Не удалось сохранить: ' + err.message); return false; }
    }
    win.body.querySelectorAll('.np-file').forEach((b) => {
      b.addEventListener('click', async () => {
        if (b.classList.contains('new')) { text.value = ''; path = null; dirty = false; updateTitle(); markDirty(); }
        if (b.classList.contains('open')) {
          const p = await win12.dialog.openFile({ title: 'Открыть', properties: ['openFile'], filters: [{ name: 'Все файлы', extensions: ['*'] }] });
          if (p) load(p);
        }
        if (b.classList.contains('save')) save(false);
        if (b.classList.contains('saveas')) save(true);
      });
    });
    if (path) await load(path); else updateTitle();
  }
};

APPS.photos = {
  id: 'photos',
  name: 'Фотографии',
  glyph: '&#xEB9F;',
  multiple: true,
  async launch(win, filePath) {
    win.body.innerHTML = `<div class="ph-view"><img alt=""></div><div class="np-status"><span class="ph-name"></span></div>`;
    const img = win.body.querySelector('img');
    img.src = 'file:///' + filePath.replace(/\\/g, '/');
    img.onload = () => win.setTitle(filePath.split(/[\\/]/).pop() + ' — Фотографии');
    img.onerror = () => { win.body.querySelector('.ph-view').textContent = 'Не удалось открыть изображение'; };
    win.body.querySelector('.ph-name').textContent = filePath;
    win.body.querySelector('.ph-view').onclick = async () => {
      const p = await win12.dialog.openImage();
      if (p) { img.src = 'file:///' + p.replace(/\\/g, '/'); win.body.querySelector('.ph-name').textContent = p; }
    };
  }
};

APPS.calc = {
  id: 'calc',
  name: 'Калькулятор',
  glyph: '&#xE8EF;',
  multiple: false,
  launch(win) {
    win.body.innerHTML = `
      <div class="calc">
        <div class="calc-display"><div class="calc-hist"></div><div class="calc-main">0</div></div>
        <div class="calc-grid">
          ${['%', 'CE', 'C', '⌫', '1/x', 'x²', '√x', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '±', '0', '.', '='].map((k) => `<button class="calc-btn${'÷×−+='.includes(k) ? ' op' : ''}${k === '=' ? ' eq' : ''}">${k}</button>`).join('')}
        </div></div>`;
    const main = win.body.querySelector('.calc-main');
    const hist = win.body.querySelector('.calc-hist');
    let cur = '0', prev = null, op = null, fresh = true;
    const show = () => { main.textContent = cur; hist.textContent = prev !== null ? `${prev} ${op || ''}` : ''; };
    const compute = () => {
      const a = parseFloat(prev), b = parseFloat(cur);
      if (op === '+') return String(a + b);
      if (op === '−') return String(a - b);
      if (op === '×') return String(a * b);
      if (op === '÷') return b === 0 ? 'Деление на ноль' : String(a / b);
      return cur;
    };
    win.body.querySelectorAll('.calc-btn').forEach((b) => b.addEventListener('click', () => {
      const k = b.textContent;
      if (/[0-9]/.test(k)) { cur = fresh || cur === '0' ? k : cur + k; fresh = false; }
      else if (k === '.') { if (!cur.includes('.')) cur += '.'; fresh = false; }
      else if (k === 'C') { cur = '0'; prev = null; op = null; fresh = true; }
      else if (k === 'CE') cur = '0';
      else if (k === '⌫') cur = cur.length > 1 ? cur.slice(0, -1) : '0';
      else if (k === '±') cur = cur.startsWith('-') ? cur.slice(1) : '-' + cur;
      else if (k === '%') cur = String(parseFloat(cur) / 100);
      else if (k === 'x²') { cur = String(parseFloat(cur) ** 2); fresh = true; }
      else if (k === '√x') { cur = String(Math.sqrt(parseFloat(cur))); fresh = true; }
      else if (k === '1/x') { cur = String(1 / parseFloat(cur)); fresh = true; }
      else if ('÷×−+'.includes(k)) {
        if (prev !== null && op && !fresh) { cur = compute(); prev = cur; } else prev = cur;
        op = k; fresh = true;
      } else if (k === '=') { if (prev !== null && op) { cur = compute(); prev = null; op = null; fresh = true; } }
      show();
    }));
  }
};

APPS.terminal = {
  id: 'terminal',
  name: 'Терминал',
  glyph: '&#xE756;',
  multiple: true,
  async launch(win) {
    let cwd = await win12.fs.home();
    win.body.innerHTML = `<div class="term"><div class="term-out"></div>
      <div class="term-line"><span class="term-ps"></span><input class="term-in" spellcheck="false" autocomplete="off"></div></div>`;
    const out = win.body.querySelector('.term-out');
    const input = win.body.querySelector('.term-in');
    const psEl = win.body.querySelector('.term-ps');
    const sep = await win12.fs.sep();
    const print = (t) => { const d = el('div', 'term-text'); d.textContent = t; out.appendChild(d); out.scrollTop = out.scrollHeight; };
    const ps = () => { psEl.textContent = cwd + '> '; };
    print('Windows 12 Command Shell [Версия 12.0.0]\n(c) Windows 12 Concept. Введите help.\n');
    ps();
    input.focus();
    win.body.addEventListener('click', () => input.focus());
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const line = input.value.trim();
      input.value = '';
      print(psEl.textContent + line);
      if (!line) return;
      const [cmd, ...args] = line.split(/\s+/);
      const c = cmd.toLowerCase();
      try {
        if (c === 'help') print('Доступно: help, dir/ls, cd, echo, type/cat, mkdir/md, del/rm, start, cls, pwd, ver, date, time');
        else if (c === 'cls') out.innerHTML = '';
        else if (c === 'pwd' || c === 'cd' && !args[0]) print(cwd);
        else if (c === 'cd' || c === 'chdir') {
          let target = args.join(' ');
          if (target === '..') { cwd = await win12.fs.dirname(cwd); }
          else if (/^[a-zA-Z]:$/.test(target)) cwd = target + sep;
          else {
            const p = target.match(/^([a-zA-Z]:)/) ? target : await win12.fs.join(cwd, target);
            if (await win12.fs.isDir(p)) cwd = target === '..' ? cwd : p; else print(`${cmd}: путь не найден: ${target}`);
          }
          ps();
        } else if (c === 'dir' || c === 'ls') {
          const items = await win12.fs.list(cwd);
          print(` Содержимое ${cwd}\n`);
          items.forEach((i) => print(`${i.isDir ? '<DIR>' : fmtSize(i.size).padStart(9)}  ${fmtDate(i.mtime || Date.now())}  ${i.name}`));
          print(`\n      файлов: ${items.filter((i) => !i.isDir).length}, папок: ${items.filter((i) => i.isDir).length}`);
        } else if (c === 'echo') print(args.join(' '));
        else if (c === 'type' || c === 'cat') {
          const p = await win12.fs.join(cwd, args[0] || '');
          print(await win12.fs.readText(p));
        } else if (c === 'mkdir' || c === 'md') { await win12.fs.mkdir(await win12.fs.join(cwd, args[0])); }
        else if (c === 'del' || c === 'rm') { await win12.fs.delete(await win12.fs.join(cwd, args[0])); print('Удалено.'); }
        else if (c === 'start') { await win12.shell.openPath(args[0] ? await win12.fs.join(cwd, args.join(' ')) : cwd); }
        else if (c === 'ver') print('Windows 12 Concept [Version 12.0.0]');
        else if (c === 'date') print(new Date().toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
        else if (c === 'time') print(new Date().toLocaleTimeString('ru-RU'));
        else print(`${cmd}: неизвестная команда. Введите help.`);
      } catch (err) { print('Ошибка: ' + err.message); }
      out.scrollTop = out.scrollHeight;
    });
  }
};

APPS.settings = {
  id: 'settings',
  name: 'Параметры',
  glyph: '&#xE713;',
  multiple: false,
  launch(win) {
    const wallpapers = {
      bloom: 'linear-gradient(135deg,#0f2027 0%,#203a43 30%,#2c5364 60%,#1a2a4f 100%)',
      sunrise: 'linear-gradient(120deg,#ff9a3c 0%,#ff5e62 40%,#3b1f5c 100%)',
      ocean: 'radial-gradient(circle at 30% 30%,#1e3a8a 0%,#0b1035 55%,#020617 100%)',
      mint: 'linear-gradient(140deg,#044f3a 0%,#0b8457 45%,#12b886 75%,#d8f5a2 120%)'
    };
    const saved = typeof Store !== 'undefined' ? Store.get() : (function () { try { return JSON.parse(localStorage.getItem('win12.settings') || '{}'); } catch (_) { return {}; } })();
    const state = {
      theme: saved.theme || 'dark',
      accent: saved.accent || '#4cc2ff',
      wallpaper: saved.wallpaper || 'bloom'
    };
    win.body.innerHTML = `
      <div class="set-wrap">
        <div class="set-side">
          <div class="set-user"><span class="avatar glyph">&#xE77B;</span><div><b>Пользователь</b><br><small>Локальная учётная запись</small></div></div>
        </div>
        <div class="set-main">
          <h2>Персонализация</h2>
          <div class="set-card">
            <h3>Режим</h3>
            <div class="set-theme-row">
              <button class="set-theme" data-t="dark"><div class="set-preview dark-pv"></div>Тёмный</button>
              <button class="set-theme" data-t="light"><div class="set-preview light-pv"></div>Светлый</button>
            </div>
          </div>
          <div class="set-card">
            <h3>Цветовой акцент</h3>
            <div class="set-accents">
              ${['#4cc2ff', '#0078d4', '#76b9ed', '#8764b8', '#e3008c', '#ff8c00', '#e74856', '#10893e', '#00cc6a'].map((c) => `<button class="set-accent" data-c="${c}" style="background:${c}"></button>`).join('')}
            </div>
          </div>
          <div class="set-card">
            <h3>Фон рабочего стола</h3>
            <div class="set-walls">
              ${Object.keys(wallpapers).map((k) => `<button class="set-wall" data-w="${k}" style="background:${wallpapers[k]}"></button>`).join('')}
              <button class="set-wall set-wall-custom">Своя&nbsp;картинка…</button>
            </div>
          </div>
          <div class="set-card set-about">
            <h3>О программе</h3>
            <p>Windows 12 Concept • Версия 1.0.0 (сборка 12.0.0)</p>
            <p>Electron ${navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1] || ''} • Renderer ${navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || ''}</p>
            <button class="set-winver" style="margin-top:8px">Открыть «О системе»</button>
          </div>
        </div>
      </div>`;
    const q = (s) => win.body.querySelector(s);
    const save = () => { try { localStorage.setItem('win12.settings', JSON.stringify(state)); } catch (_) {} };
    const apply = () => {
      document.body.classList.toggle('light', state.theme === 'light');
      document.documentElement.style.setProperty('--accent', state.accent);
      const acc = state.accent.startsWith('#') ? state.accent : '#4cc2ff';
      const r = parseInt(acc.slice(1, 3), 16), g = parseInt(acc.slice(3, 5), 16), b = parseInt(acc.slice(5, 7), 16);
      document.documentElement.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.3)`);
      document.getElementById('wallpaper').style.background = wallpapers[state.wallpaper] || state.wallpaper;
      win.body.querySelectorAll('.set-theme').forEach((b) => b.classList.toggle('selected', b.dataset.t === state.theme));
      win.body.querySelectorAll('.set-accent').forEach((b) => b.classList.toggle('selected', b.dataset.c === state.accent));
      win.body.querySelectorAll('.set-wall').forEach((b) => b.classList.toggle('selected', b.dataset.w === state.wallpaper));
    };
    win.body.querySelectorAll('.set-theme').forEach((b) => b.onclick = () => { state.theme = b.dataset.t; save(); apply(); });
    win.body.querySelectorAll('.set-accent').forEach((b) => b.onclick = () => { state.accent = b.dataset.c; save(); apply(); });
    win.body.querySelectorAll('.set-wall').forEach((b) => {
      b.onclick = async () => {
        if (b.classList.contains('set-wall-custom')) {
          const p = await win12.dialog.openImage();
          if (p) { state.wallpaper = 'center/cover no-repeat url("file:///' + p.replace(/\\/g, '/') + '")'; save(); apply(); }
          return;
        }
        state.wallpaper = b.dataset.w; save(); apply();
      };
    });
    q('.set-winver').onclick = () => APPS.about.launch(WM.createWindow({ w: 420, h: 330 }));
    apply();
  }
};

APPS.about = {
  id: 'about',
  name: 'О системе',
  glyph: '&#xE946;',
  multiple: false,
  launch(win) {
    win.body.innerHTML = `
      <div class="about">
        <span class="glyph win-logo about-logo">&#xE7F8;</span>
        <h2>Windows 12 Concept</h2>
        <p class="about-ver">Версия 1.0.0 • Сборка 12.0.0</p>
        <p>© ${new Date().getFullYear()} Windows 12 Concept. Все совпадения с настоящей Windows — randomly.</p>
        <p class="about-small">Некоммерческий концепт-проект. Microsoft и Windows — товарные знаки Microsoft Corporation.</p>
      </div>`;
  }
};
