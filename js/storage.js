/* ============================================
   storage.js - localStorage 持久化封装 (v4.0 精简版)
   【v4.0 变更：彻底删除趋势图字段】
   - 移除: KEY_STATS 中的 accuracyHistory 字段
   - 移除: addSessionStat() 趋势数据写入逻辑
   - 简化: getStats() / addSessionStat() 仅保留 totalSessions 计数
   - 移除: init() 中 accuracyHistory 初始化
   【v3.0 变更：彻底移除间隔重复全部字段与函数】
   - 移除: KEY_SPACED / getSpacedData / setSpacedData / updateSpaced / getDueForReview
   - 移除: submitAnswer 不再调用 updateSpaced
   - 移除: _incWrongDetail 中 lastReviewTime 字段
   - 移除: recordAttempt 中 lastReviewTime 默认值
   【保留功能】
   - 作答记录 (PREFIX_ANS / PREFIX_OPT)
   - 错题列表 (KEY_WRONG) + 错题详情 (KEY_WRONG_DETAIL)
   - 进度管理 (KEY_PROGRESS)
   - 标签/收藏/笔记 (KEY_QUESTION_META / KEY_TAGS)
   - 全局统计 (KEY_STATS) 仅保留 totalSessions + totalDone
   - 用户偏好 (KEY_PREF)
   ============================================ */
const Storage = {
  PREFIX_ANS:  'eq_a_',
  PREFIX_OPT:  'eq_o_',
  KEY_WRONG:         'eq_wrong_list',
  KEY_WRONG_DETAIL:  'eq_wrong_detail',
  KEY_PROGRESS:      'eq_progress',
  KEY_TAGS:          'eq_tags_custom',
  KEY_QUESTION_META: 'eq_q_meta',
  KEY_STATS:         'eq_global_stats',
  KEY_PREF:          'eq_user_pref',
  // ============ 初始化 (v4.0: 移除 accuracyHistory 初始化) ============
  init() {
    if (!localStorage.getItem(this.KEY_TAGS))
      localStorage.setItem(this.KEY_TAGS, JSON.stringify(['易混淆','死记硬背','高频考点']));
    if (!localStorage.getItem(this.KEY_STATS))
      localStorage.setItem(this.KEY_STATS, JSON.stringify({ totalDone:0, totalSessions:0 }));
    if (!localStorage.getItem(this.KEY_WRONG_DETAIL))
      localStorage.setItem(this.KEY_WRONG_DETAIL, JSON.stringify({}));
    if (!localStorage.getItem(this.KEY_QUESTION_META))
      localStorage.setItem(this.KEY_QUESTION_META, JSON.stringify({}));
    if (!localStorage.getItem(this.KEY_PREF)) {
      localStorage.setItem(this.KEY_PREF, JSON.stringify({
        darkMode: false,
        hotkeyEnabled: true,
        autoJumpDelay: 1200,
        randomOptions: false
      }));
    }
    // 清理废弃字段
    const keyToRemove = 'eq_spaced_repeat';
    if (localStorage.getItem(keyToRemove) !== null) {
      localStorage.removeItem(keyToRemove);
    }
    const pref = this.getPref();
    let prefChanged = false;
    const deprecatedKeys = [
      'spacedIntensity', 'wrongThreshold', 'insertMode',
      'spacedEnabled', 'preferRecentWrongs', 'preferAllHistoryWrongs'
    ];
    deprecatedKeys.forEach(k => {
      if (k in pref) { delete pref[k]; prefChanged = true; }
    });
    if (prefChanged) {
      localStorage.setItem(this.KEY_PREF, JSON.stringify(pref));
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
  getAnswer(id)     { return localStorage.getItem(this.PREFIX_ANS + id); },
  removeAnswer(id)  { localStorage.removeItem(this.PREFIX_ANS + id); },
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
  // ===================== 题目元数据（标签/收藏/笔记） =====================
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
    localStorage.removeItem('eq_spaced_repeat');
  },
  getWrongDetail() {
    try { return JSON.parse(localStorage.getItem(this.KEY_WRONG_DETAIL)||'{}'); } catch(e){ return {}; }
  },
  _incWrongDetail(id) {
    const d = this.getWrongDetail();
    if (!d[id]) d[id] = { totalAttempts:0, wrongCount:0, lastWrongTime:0, wrongRate:0 };
    d[id].wrongCount++;
    d[id].lastWrongTime = Date.now();
    if (d[id].totalAttempts>0) d[id].wrongRate = Number((d[id].wrongCount/d[id].totalAttempts).toFixed(4));
    localStorage.setItem(this.KEY_WRONG_DETAIL, JSON.stringify(d));
  },
  recordAttempt(id, isCorrect) {
    const d = this.getWrongDetail();
    if (!d[id]) d[id] = { totalAttempts:0, wrongCount:0, lastWrongTime:0, wrongRate:0 };
    d[id].totalAttempts++;
    d[id].wrongRate = Number((d[id].wrongCount/d[id].totalAttempts).toFixed(4));
    localStorage.setItem(this.KEY_WRONG_DETAIL, JSON.stringify(d));
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
  // ===================== 用户偏好 =====================
  getPref() {
    try { return JSON.parse(localStorage.getItem(this.KEY_PREF)||'{}'); } catch(e){ return {}; }
  },
  setPref(obj) {
    const cur = this.getPref();
    Object.assign(cur, obj);
    localStorage.setItem(this.KEY_PREF, JSON.stringify(cur));
  },
  // ===================== 全局统计 (v4.0: 移除 accuracyHistory) =====================
  getStats() {
    try { return JSON.parse(localStorage.getItem(this.KEY_STATS)||'{}'); } catch(e){ return {}; }
  },
  /** v4.0: 仅更新 totalSessions + totalDone，不再记录趋势数据 */
  addSessionStat(/* accuracy, total, correct, wrong */) {
    let s = this.getStats();
    s.totalSessions = (s.totalSessions||0)+1;
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
  submitAnswer(id, userAns) {
    if (!userAns) return { correct: false };
    this.saveAnswer(id, userAns);
    const correct = this.checkCorrect(id, userAns);
    this.recordAttempt(id, correct);
    if (correct) this.removeWrong(id);
    else this.addWrong(id);
    return { correct };
  }
};