/* ============================================
   storage.js - localStorage 完整持久化封装
   涵盖：作答记录、错题、进度、标签、收藏、笔记、
   全局统计、间隔重复权重、用户偏好配置
   ============================================ */
const Storage = {
  // ============ 键名前缀 ============
  PREFIX_ANS: 'eq_a_',
  PREFIX_CNT: 'eq_c_',
  PREFIX_OPT: 'eq_o_',
  KEY_WRONG: 'eq_wrong_list',
  KEY_WRONG_DETAIL: 'eq_wrong_detail',
  KEY_PROGRESS: 'eq_progress',
  KEY_TAGS: 'eq_tags_custom',
  KEY_STATS: 'eq_global_stats',
  KEY_SPACED: 'eq_spaced_repeat',
  KEY_PREF: 'eq_user_pref',
  // ============ 初始化 ============
  init() {
    if (!localStorage.getItem(this.KEY_TAGS)) {
      localStorage.setItem(this.KEY_TAGS, JSON.stringify(['易混淆', '死记硬背', '高频考点']));
    }
    if (!localStorage.getItem(this.KEY_STATS)) {
      localStorage.setItem(this.KEY_STATS, JSON.stringify({ totalDone: 0, totalSessions: 0, accuracyHistory: [] }));
    }
    if (!localStorage.getItem(this.KEY_SPACED)) {
      localStorage.setItem(this.KEY_SPACED, JSON.stringify({}));
    }
    if (!localStorage.getItem(this.KEY_WRONG_DETAIL)) {
      localStorage.setItem(this.KEY_WRONG_DETAIL, JSON.stringify({}));
    }
    if (!localStorage.getItem(this.KEY_PREF)) {
      localStorage.setItem(this.KEY_PREF, JSON.stringify({
        darkMode: false, hotkeyEnabled: true, spacedIntensity: 3, reviewPriority: 'recent'
      }));
    }
  },
  // ============ 作答记录 ============
  saveAnswer(id, value) {
    localStorage.setItem(this.PREFIX_ANS + id, value);
    // 选项选择次数统计
    if (value && value.length > 0) {
      const optKey = this.PREFIX_OPT + id;
      let optData = {};
      try { optData = JSON.parse(localStorage.getItem(optKey) || '{}'); } catch (e) { }
      const parts = value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      parts.forEach(p => { optData[p] = (optData[p] || 0) + 1; });
      localStorage.setItem(optKey, JSON.stringify(optData));
    }
  },
  getAnswer(id) { return localStorage.getItem(this.PREFIX_ANS + id); },
  removeAnswer(id) { localStorage.removeItem(this.PREFIX_ANS + id); },
  clearAllAnswers() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(this.PREFIX_ANS) || k.startsWith(this.PREFIX_CNT) || k.startsWith(this.PREFIX_OPT))) {
        localStorage.removeItem(k);
      }
    }
  },
  /** 获取某题选项选择次数分布 */
  getOptionStats(id) {
    try { return JSON.parse(localStorage.getItem(this.PREFIX_OPT + id) || '{}'); } catch (e) { return {}; }
  },
  // ============ 错题管理 ============
  getWrongList() {
    try { return JSON.parse(localStorage.getItem(this.KEY_WRONG) || '[]'); } catch (e) { return []; }
  },
  addWrong(id) {
    const list = this.getWrongList();
    if (!list.includes(id)) { list.push(id); this._setWrongList(list); }
    this._incWrongDetail(id);
  },
  removeWrong(id) {
    let list = this.getWrongList().filter(wid => wid !== id);
    this._setWrongList(list);
  },
  clearAllWrong() {
    localStorage.removeItem(this.KEY_WRONG);
    localStorage.removeItem(this.KEY_WRONG_DETAIL);
  },
  _setWrongList(list) { localStorage.setItem(this.KEY_WRONG, JSON.stringify(list)); },
  /** 错题详细数据：{ [id]: { totalAttempts, wrongCount, lastWrongTime, wrongRate } } */
  getWrongDetail() {
    try { return JSON.parse(localStorage.getItem(this.KEY_WRONG_DETAIL) || '{}'); } catch (e) { return {}; }
  },
  _incWrongDetail(id) {
    let detail = this.getWrongDetail();
    if (!detail[id]) detail[id] = { totalAttempts: 0, wrongCount: 0, lastWrongTime: 0, wrongRate: 0 };
    detail[id].wrongCount++;
    detail[id].lastWrongTime = Date.now();
    if (detail[id].totalAttempts > 0) {
      detail[id].wrongRate = detail[id].wrongCount / detail[id].totalAttempts;
    }
    localStorage.setItem(this.KEY_WRONG_DETAIL, JSON.stringify(detail));
  },
  recordAttempt(id, isCorrect) {
    let detail = this.getWrongDetail();
    if (!detail[id]) detail[id] = { totalAttempts: 0, wrongCount: 0, lastWrongTime: 0, wrongRate: 0 };
    detail[id].totalAttempts++;
    if (isCorrect) {
      detail[id].wrongRate = detail[id].wrongCount / detail[id].totalAttempts;
    }
    localStorage.setItem(this.KEY_WRONG_DETAIL, JSON.stringify(detail));
  },
  // ============ 间隔重复（艾宾浩斯） ============
  getSpacedData() {
    try { return JSON.parse(localStorage.getItem(this.KEY_SPACED) || '{}'); } catch (e) { return {}; }
  },
  setSpacedData(data) { localStorage.setItem(this.KEY_SPACED, JSON.stringify(data)); },
  /** 更新错题间隔重复数据 */
  updateSpaced(id, isCorrect) {
    let sd = this.getSpacedData();
    if (!sd[id]) sd[id] = { weight: 1, interval: 1, lastReview: 0, reviewCount: 0, easeFactor: 2.5 };
    const entry = sd[id];
    if (isCorrect) {
      entry.reviewCount++;
      entry.interval = Math.round(entry.interval * entry.easeFactor);
      entry.easeFactor = Math.min(3.0, entry.easeFactor + 0.1);
      entry.weight = Math.max(0.1, entry.weight * 0.8);
    } else {
      entry.reviewCount = 0;
      entry.interval = 1;
      entry.easeFactor = Math.max(1.3, entry.easeFactor - 0.2);
      entry.weight = Math.min(10, entry.weight + 1);
    }
    entry.lastReview = Date.now();
    this.setSpacedData(sd);
  },
  /** 获取需要复习的错题ID列表（基于间隔重复算法） */
  getDueForReview() {
    const sd = this.getSpacedData();
    const now = Date.now();
    const due = [];
    const wrongIds = this.getWrongList();
    wrongIds.forEach(id => {
      const entry = sd[id];
      if (!entry) { due.push(id); return; }
      const intervalMs = entry.interval * 24 * 60 * 60 * 1000;
      if (now - entry.lastReview >= intervalMs) due.push(id);
    });
    return due;
  },
  // ============ 进度管理 ============
  saveProgress(data) { localStorage.setItem(this.KEY_PROGRESS, JSON.stringify(data)); },
  getProgress() {
    try { return JSON.parse(localStorage.getItem(this.KEY_PROGRESS) || '{}'); } catch (e) { return {}; }
  },
  clearProgress() { localStorage.removeItem(this.KEY_PROGRESS); },
  // ============ 标签管理 ============
  getTags() {
    try { return JSON.parse(localStorage.getItem(this.KEY_TAGS) || '[]'); } catch (e) { return ['易混淆', '死记硬背', '高频考点']; }
  },
  addTag(tag) {
    let tags = this.getTags();
    if (!tags.includes(tag)) { tags.push(tag); localStorage.setItem(this.KEY_TAGS, JSON.stringify(tags)); }
    return tags;
  },
  removeTag(tag) {
    let tags = this.getTags().filter(t => t !== tag);
    localStorage.setItem(this.KEY_TAGS, JSON.stringify(tags));
    return tags;
  },
  // ============ 用户偏好 ============
  getPref() {
    try { return JSON.parse(localStorage.getItem(this.KEY_PREF) || '{}'); } catch (e) { return {}; }
  },
  setPref(obj) {
    const current = this.getPref();
    Object.assign(current, obj);
    localStorage.setItem(this.KEY_PREF, JSON.stringify(current));
  },
  // ============ 全局统计 ============
  getStats() {
    try { return JSON.parse(localStorage.getItem(this.KEY_STATS) || '{}'); } catch (e) { return {}; }
  },
  addSessionStat(accuracy) {
    let stats = this.getStats();
    stats.totalSessions = (stats.totalSessions || 0) + 1;
    stats.accuracyHistory = stats.accuracyHistory || [];
    stats.accuracyHistory.push({ date: new Date().toISOString().slice(0, 10), accuracy: parseFloat(accuracy) });
    if (stats.accuracyHistory.length > 50) stats.accuracyHistory = stats.accuracyHistory.slice(-50);
    stats.totalDone = 0;
    questionList.forEach(q => { if (this.getAnswer(q.id)) stats.totalDone++; });
    localStorage.setItem(this.KEY_STATS, JSON.stringify(stats));
  },
  // ============ 答案判定 ============
  checkCorrect(id, userAns) {
    const q = questionList.find(item => item.id === id);
    if (!q || !userAns) return false;
    const ref = q.answer;
    switch (q.type) {
      case 'radio': case 'judge':
        return userAns.trim().toUpperCase() === ref.trim().toUpperCase();
      case 'checkbox': {
        const u = new Set(userAns.split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
        const r = new Set(ref.split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
        if (u.size !== r.size) return false;
        for (const v of u) { if (!r.has(v)) return false; }
        return true;
      }
      case 'fill': {
        const userLower = userAns.trim().toLowerCase();
        const refs = ref.split('、').map(s => s.trim().toLowerCase()).filter(Boolean);
        const userParts = userAns.split(/[、,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
        if (refs.length === 1) return userLower.includes(refs[0]);
        if (userParts.length < refs.length) return false;
        for (let i = 0; i < refs.length; i++) {
          if (!userParts[i] || !userParts[i].includes(refs[i])) return false;
        }
        return true;
      }
    }
    return false;
  },
  /** 完整答题流程：保存答案 → 更新统计 → 更新错题 → 更新间隔重复 */
  submitAnswer(id, userAns) {
    this.saveAnswer(id, userAns);
    const correct = this.checkCorrect(id, userAns);
    this.recordAttempt(id, correct);
    this.updateSpaced(id, correct);
    if (correct) { this.removeWrong(id); }
    else { this.addWrong(id); }
    return correct;
  }
};
