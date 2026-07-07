/* ============================================
   darkmode.js v7.0 - 深色/浅色模式切换
   按钮使用 .eq-dark-toggle 前缀隔离
   ============================================ */
const DarkMode = {
  init() {
    const pref = Storage.getPref();
    if (pref.darkMode) this.enable();
    else this.disable();
    this._createToggle();
  },
  toggle() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    Storage.setPref({ darkMode: isDark });
    const btn = document.getElementById('darkToggleBtn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  },
  enable() { document.body.classList.add('dark'); },
  disable() { document.body.classList.remove('dark'); },
  _createToggle() {
    if (document.getElementById('darkToggleBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'darkToggleBtn';
    btn.className = 'eq-dark-toggle dark-toggle';
    btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    btn.title = '切换深色/浅色模式';
    btn.onclick = () => this.toggle();
    document.body.appendChild(btn);
  }
};