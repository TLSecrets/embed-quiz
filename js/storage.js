/* ============================================
   storage.js - localStorage 完整持久化封装 (v2.0 全面重构)
   涵盖：作答记录、错题、进度、标签、收藏、笔记、
   全局统计、间隔重复权重（含遗忘权重）、用户偏好、
   选项选择次数分布、错题准入阈值
   
   【v2.0 修改点】
   - submitAnswer 完整实现（原缺失关键逻辑）
   - 错题数据增加 lastReviewTime
   - 间隔重复增加遗忘权重 forgettingWeight
   - 标签/收藏/笔记独立 KEY_QUESTION_META 持久化防丢失
   - 用户偏好增补 autojumpDelay/wrongThreshold/insertMode/randomOptions 等
   - recordAttempt 每次作答均重算 wrongRate
   ============================================ */
const Storage = {
  // ============ 键名前缀 ============
  PREFIX_ANS:  'eq_a_',
  PREFIX_OPT:  'eq_o_',
  KEY_WRONG:         'eq_wrong_list',
  KEY_WRONG_DETAIL:  'eq_wrong_detail',
  KEY_PROGRESS:      'eq_progress',
  KEY_TAGS:          'eq_tags_custom',
  KEY_QUESTION_META: 'eq_q_meta',
  KEY_STATS:         'eq_global_stats',
  KEY_SPACED:        'eq_spaced_repeat',
  KEY_PREF:          'eq_user_pref',

  // ============ 初始化 ============
  init() {
    if (!localStorage.getItem(this.KEY_TAGS))
      localStorage.setItem(this.KEY_TAGS, JSON.stringify(['易混淆','死记硬背','高频考点']));
    if (!localStorage.getItem(this.KEY_STATS))
      localStorage.setItem(this.KEY_STATS, JSON.stringify({ totalDone:0, totalSessions:0, accuracyHistory:[] }));
    if (!localStorage.getItem(this.KEY_SPACED))
      localStorage.setItem(this.KEY_SPACED, JSON.stringify({}));
    if (!localStorage.getItem(this.KEY_WRONG_DETAIL))
      localStorage.setItem(this.KEY_WRONG_DETAIL, JSON.stringify({}));
    if (!localStorage.getItem(this.KEY_QUESTION_META))
      localStorage.setItem(this.KEY_QUESTION_META, JSON.stringify({}));
    if (!localStorage.getItem(this.KEY_PREF)) {
      localStorage.setItem(this.KEY_PREF, JSON.stringify({
        darkMode: false, hotkeyEnabled: true,
        spacedIntensity: 3,       // 复习插入区间强度 1~10
        wrongThreshold: 50,        // 错题准入阈值 0~100（正确率≤该值纳入复习）
        insertMode: 'append',      // 'replace'|'append' 间隔重复插入模式
        autoJumpDelay: 1200,       // 自动跳转延迟(ms)
        randomOptions: false,      // 选项随机打乱
        preferRecentWrongs: true,   // 优先本次练习错题
        preferAllHistoryWrongs: true // 优先全部历史错题
      }));
    }
  },

  // ===================== 作答记录 =====================
  saveAnswer(id, value) {
    localStorage.setItem(this.PREFIX_ANS + id, value);
    if (value && value.length) {
      const key = this.PREFIX_OPT + id;
      let o = {};
      try { o = JSON.parse(localStorage.getItem(key)||'{}'); } catch(e){}
      value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean).forEach(p=>{ o[p]=(o[p]||0)+1; });
      localStorage.setItem(key, JSON.stringify(o));
    }
  },
  getAnswer(id)      { return localStorage.getItem(this.PREFIX_ANS + id); },
  removeAnswer(id)   { localStorage.removeItem(this.PREFIX_ANS + id); },
  clearAllAnswers() {
    for (let i=localStorage.length-1; i>=0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(this.PREFIX_ANS)||k.startsWith(this.PREFIX_OPT)))
        localStorage.removeItem(k);
    }
  },
  getOptionStats(id) {
    try { return JSON.parse(localStorage.getItem(this.PREFIX_OPT+id)||'{}'); } catch(e){ return {}; }
  },

  // ===================== 题目元数据（标签/收藏/笔记）独立持久化 =====================
  getQuestionMeta() {
    try { return JSON.parse(localStorage.getItem(this.KEY_QUESTION_META)||'{}'); } catch(e){ return {}; }
  },
  _setMeta(meta) { localStorage.setItem(this.KEY_QUESTION_META, JSON.stringify(meta)); },

  getQuestionData(id) {
    const m = this.getQuestionMeta();
    const k = String(id);
    return m[k] || { tags:[], collect:false, note:'' };
  },
  setQuestionData(id, data) {
    const m = this.getQuestionMeta();
    const k = String(id);
    if (!m[k]) m[k] = { tags:[], collect:false, note:'' };
    Object.assign(m[k], data);
    this._setMeta(m);
  },
  toggleTag(id, tag) {
    const m = this.getQuestionMeta();
    const k = String(id);
    if (!m[k]) m[k] = { tags:[], collect:false, note:'' };
    const idx = m[k].tags.indexOf(tag);
    idx>=0 ? m[k].tags.splice(idx,1) : m[k].tags.push(tag);
    this._setMeta(m);
    return m[k].tags;
  },
  toggleCollect(id) {
    const m = this.getQuestionMeta();
    const k = String(id);
    if (!m[k]) m[k] = { tags:[], collect:false, note:'' };
    m[k].collect = !m[k].collect;
    this._setMeta(m);
    return m[k].collect;
  },
  saveNote(id, note) {
    const m = this.getQuestionMeta();
    const k = String(id);
    if (!m[k]) m[k] = { tags:[], collect:false, note:'' };
    m[k].note = note;
    this._setMeta(m);
  },

  // ===================== 错题管理 =====================
  getWrongList() {
    try { return JSON.parse(localStorage.getItem(this.KEY_WRONG)||'[]'); } catch(e){ return []; }
  },
  _setWrongList(list) { localStorage.setItem(this.KEY_WRONG, JSON.stringify(list)); },
  addWrong(id) {
    const list = this.getWrongList();
    if (!list.includes(id)) { list.push(id); this._setWrongList(list); }
    this._incWrongDetail(id);
  },
  removeWrong(id) {
    const list = this.getWrongList().filter(w=>w!==id);
    this._setWrongList(list);
  },
  clearAllWrong() {
    localStorage.removeItem(this.KEY_WRONG);
    localStorage.removeItem(this.KEY_WRONG_DETAIL);
  },

  getWrongDetail() {
    try { return JSON.parse(localStorage.getItem(this.KEY_WRONG_DETAIL)||'{}'); } catch(e){ return {}; }
  },
  _incWrongDetail(id) {
    const d = this.getWrongDetail();
    if (!d[id]) d[id] = { totalAttempts:0, wrongCount:0, lastWrongTime:0, wrongRate:0, lastReviewTime:0 };
    d[id].wrongCount++;
    d[id].lastWrongTime = Date.now();
    if (d[id].totalAttempts>0) d[id].wrongRate = Number((d[id].wrongCount/d[id].totalAttempts).toFixed(4));
    localStorage.setItem(this.KEY_WRONG_DETAIL, JSON.stringify(d));
  },
  recordAttempt(id, isCorrect) {
    const d = this.getWrongDetail();
    if (!d[id]) d[id] = { totalAttempts:0, wrongCount:0, lastWrongTime:0, wrongRate:0, lastReviewTime:0 };
    d[id].totalAttempts++;
    d[id].wrongRate = Number((d[id].wrongCount/d[id].totalAttempts).toFixed(4));
    localStorage.setItem(this.KEY_WRONG_DETAIL, JSON.stringify(d));
  },

  // ===================== 间隔重复（艾宾浩斯）v2.0 完整重构 =====================
  getSpacedData() {
    try { return JSON.parse(localStorage.getItem(this.KEY_SPACED)||'{}'); } catch(e){ return {}; }
  },
  setSpacedData(data) { localStorage.setItem(this.KEY_SPACED, JSON.stringify(data)); },

  /** 更新错题间隔重复数据（含遗忘权重） */
  updateSpaced(id, isCorrect) {
    let sd = this.getSpacedData();
    if (!sd[id]) sd[id] = {
      weight: 1,          // 遗忘权重 0.1~10
      interval: 1,        // 当前间隔(天)
      lastReview: 0,      // 上次复习时间戳
      reviewCount: 0,     // 连续正确次数
      easeFactor: 2.5     // 简易度因子 1.3~3.0
    };
    const e = sd[id];
    if (isCorrect) {
      e.reviewCount++;
      e.interval = Math.round(e.interval * e.easeFactor);
      e.easeFactor = Math.min(3.0, e.easeFactor + 0.1);
      e.weight = Math.max(0.1, e.weight * 0.8);
    } else {
      e.reviewCount = 0;
      e.interval = 1;
      e.easeFactor = Math.max(1.3, e.easeFactor - 0.2);
      e.weight = Math.min(10, e.weight + 1);
    }
    e.lastReview = Date.now();
    this.setSpacedData(sd);
  },

  /** 需要复习的错题ID（基于间隔 + 错题准入阈值） */
  getDueForReview(typeFilter) {
    const sd = this.getSpacedData();
    const now = Date.now();
    const pref = this.getPref();
    const threshold = (pref.wrongThreshold!==undefined ? pref.wrongThreshold : 50) / 100;
    const detail = this.getWrongDetail();
    const due = [];
    this.getWrongList().forEach(id => {
      const d = detail[id];
      if (d && d.totalAttempts>0) {
        const cr = 1 - (d.wrongRate||0);
        if (cr > threshold) return;  // 正确率高于阈值，跳过
      }
      // 题型匹配
      if (typeFilter) {
        const q = questionList.find(qq=>qq.id===id);
        if (!q || q.type !== typeFilter) return;
      }
      const entry = sd[id];
      if (!entry) { due.push(id); return; }
      if (now - entry.lastReview >= entry.interval*24*60*60*1000) due.push(id);
    });
    return due;
  },

  // ===================== 进度管理 =====================
  saveProgress(data)   { localStorage.setItem(this.KEY_PROGRESS, JSON.stringify(data)); },
  getProgress()        { try { return JSON.parse(localStorage.getItem(this.KEY_PROGRESS)||'{}'); } catch(e){ return {}; } },
  clearProgress()      { localStorage.removeItem(this.KEY_PROGRESS); },

  // ===================== 标签库 =====================
  getTags() {
    try { return JSON.parse(localStorage.getItem(this.KEY_TAGS)||'[]'); } catch(e){ return ['易混淆','死记硬背','高频考点']; }
  },
  addTag(tag) {
    let ts = this.getTags();
    if (!ts.includes(tag)) { ts.push(tag); localStorage.setItem(this.KEY_TAGS, JSON.stringify(ts)); }
    return ts;
  },
  removeTag(tag) {
    let ts = this.getTags().filter(t=>t!==tag);
    localStorage.setItem(this.KEY_TAGS, JSON.stringify(ts));
    return ts;
  },

  // ===================== 用户偏好 v2.0 =====================
  getPref() {
    try { return JSON.parse(localStorage.getItem(this.KEY_PREF)||'{}'); } catch(e){ return {}; }
  },
  setPref(obj) {
    const cur = this.getPref();
    Object.assign(cur, obj);
    localStorage.setItem(this.KEY_PREF, JSON.stringify(cur));
  },

  // ===================== 全局统计 =====================
  getStats() {
    try { return JSON.parse(localStorage.getItem(this.KEY_STATS)||'{}'); } catch(e){ return {}; }
  },
  addSessionStat(accuracy, total, correct, wrong) {
    let s = this.getStats();
    s.totalSessions = (s.totalSessions||0)+1;
    s.accuracyHistory = s.accuracyHistory||[];
    s.accuracyHistory.push({ date: new Date().toISOString().slice(0,10), accuracy:parseFloat(accuracy), total, correct, wrong });
    if (s.accuracyHistory.length>50) s.accuracyHistory = s.accuracyHistory.slice(-50);
    s.totalDone = 0;
    questionList.forEach(q=>{ if (this.getAnswer(q.id)) s.totalDone++; });
    localStorage.setItem(this.KEY_STATS, JSON.stringify(s));
  },

  // ===================== 答案判定 =====================
  checkCorrect(id, userAns) {
    const q = questionList.find(it=>it.id===id);
    if (!q||!userAns) return false;
    const ref = q.answer;
    switch(q.type) {
      case 'radio': case 'judge':
        return userAns.trim().toUpperCase() === ref.trim().toUpperCase();
      case 'checkbox': {
        const u=new Set(userAns.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean));
        const r=new Set(ref.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean));
        if (u.size!==r.size) return false;
        for (const v of u) if(!r.has(v)) return false;
        return true;
      }
      case 'fill': {
        const ul = userAns.trim().toLowerCase();
        const refs=ref.split('、').map(s=>s.trim().toLowerCase()).filter(Boolean);
        const ups =userAns.split(/[、,]/).map(s=>s.trim().toLowerCase()).filter(Boolean);
        if (refs.length===1) return ul.includes(refs[0]);
        if (ups.length<refs.length) return false;
        for (let i=0;i<refs.length;i++) if(!ups[i]||!ups[i].includes(refs[i])) return false;
        return true;
      }
    }
    return false;
  },

  /** 完整答题流程 v2.0 */
  submitAnswer(id, userAns) {
    if (!userAns) return { correct: false };
    this.saveAnswer(id, userAns);
    const correct = this.checkCorrect(id, userAns);
    this.recordAttempt(id, correct);
    this.updateSpaced(id, correct);
    if (correct) this.removeWrong(id);
    else this.addWrong(id);
    return { correct };
  }
};
