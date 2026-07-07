/* ============================================
   hotkey.js - 键盘快捷键监听模块
   ============================================ */
const Hotkey = {
  handlers: {},
  enabled: true,
  init() {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // 如果焦点在输入框/文本域，不触发快捷键（Enter除外）
      const tag = document.activeElement.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (isInput && e.key !== 'Enter') return;
      const handler = this.handlers[e.key];
      if (handler) { e.preventDefault(); handler(e); }
    });
    // 从偏好恢复
    const pref = Storage.getPref();
    this.enabled = pref.hotkeyEnabled !== false;
  },
  setEnabled(v) { this.enabled = v; Storage.setPref({ hotkeyEnabled: v }); },
  /** 注册考试页快捷键 */
  registerExam(actions) {
    this.handlers = {
      '1': () => { if (actions.selectOption) actions.selectOption('A'); },
      '2': () => { if (actions.selectOption) actions.selectOption('B'); },
      '3': () => { if (actions.selectOption) actions.selectOption('C'); },
      '4': () => { if (actions.selectOption) actions.selectOption('D'); },
      'ArrowLeft': () => { if (actions.prev) actions.prev(); },
      'ArrowRight': () => { if (actions.next) actions.next(); },
      'Enter': () => { if (actions.next) actions.next(); },
    };
  },
  unregister() { this.handlers = {}; }
};
