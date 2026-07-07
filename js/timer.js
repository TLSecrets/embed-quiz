/* ============================================
   timer.js - 集中计时器管理 v7.0
   所有 setTimeout/setInterval 统一注册、统一销毁
   防止离开页面后定时器继续运行造成内存泄漏
   ============================================ */
const TimerManager = {
  _timers: [],
  /**
   * 创建延时定时器（自动注册）
   * @param {Function} fn
   * @param {number} delay ms
   * @returns {number} timerId
   */
  setTimeout(fn, delay) {
    const id = setTimeout(() => {
      this._remove(id);
      try { fn(); } catch (e) { console.warn('[TimerManager] callback error:', e); }
    }, delay);
    this._timers.push(id);
    return id;
  },
  /**
   * 创建循环定时器（自动注册）
   * @param {Function} fn
   * @param {number} interval ms
   * @returns {number} timerId
   */
  setInterval(fn, interval) {
    const id = setInterval(fn, interval);
    this._timers.push(id);
    return id;
  },
  /**
   * 清除指定定时器
   * @param {number} id
   */
  clear(id) {
    clearTimeout(id);
    clearInterval(id);
    this._remove(id);
  },
  /** 销毁所有定时器 */
  clearAll() {
    this._timers.forEach(id => {
      clearTimeout(id);
      clearInterval(id);
    });
    this._timers = [];
  },
  _remove(id) {
    const idx = this._timers.indexOf(id);
    if (idx >= 0) this._timers.splice(idx, 1);
  }
};