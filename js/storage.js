/* ============================================
   storage.js - localStorage 持久化封装 v7.0
   【v7.0 变更】
   - 所有读写操作增加 try-catch 异常捕获
   - JSON 解析容错，损坏数据自动修复
   - localStorage 不可用时优雅降级到内存存储
   ============================================ */
const Storage = (function() {
  'use strict';
  // ============ 内部内存兜底（localStorage不可用时） ============
  let _memFallback = {};
  let _lsAvailable = false;
  try {
    const testKey = '__eq_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    _lsAvailable = true;
  } catch (e) {
    _lsAvailable = false;
    console.warn('[Storage] localStorage 不可用，降级为内存存储（刷新后数据丢失）');
  }
  function _get(k) {
    try {
      if (_lsAvailable) {
        const v = localStorage.getItem(k);
        return v;
      }
      return _memFallback[k] || null;
    } catch (e) { return _memFallback[k] || null; }
  }
  function _set(k, v) {
    try {
      if (_lsAvailable) { localStorage.setItem(k, v); }
      else { _memFallback[k] = v; }
    } catch (e) {
      _memFallback[k] = v;
      console.warn('[Storage] 写入失败，使用内存降级:', e.message);
    }
  }
  function _remove(k) {
    try {
      if (_lsAvailable) { localStorage.removeItem(k); }
      else { delete _memFallback[k]; }
    } catch (e) { delete _memFallback[k]; }
  }
  function _jsonGet(k, fallback) {
    try {
      const raw = _get(k);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Storage] JSON解析失败，重置为默认值:', k, e.message);
      _set(k, JSON.stringify(fallback));
      return fallback;
    }
  }
  function _jsonSet(k, obj) {
    try { _set(k, JSON.stringify(obj)); }
    catch (e) { console.warn('[Storage] JSON序列化失败:', e.message); }
  }
  // ============ 键名 ============
  const PREFIX_ANS  = 'eq_a_';
  const PREFIX_OPT  = 'eq_o_';
  const KEY_WRONG         = 'eq_wrong_list';
  const KEY_WRONG_DETAIL  = 'eq_wrong_detail';
  const KEY_PROGRESS      = 'eq_progress';
  const KEY_TAGS          = 'eq_tags_custom';
  const KEY_QUESTION_META = 'eq_q_meta';
  const KEY_STATS         = 'eq_global_stats';
  const KEY_PREF          = 'eq_user_pref';
  const KEY_LAST_REPORT   = 'eq_last_report';
  // ============ 初始化 ============
  function init() {
    if (!_jsonGet(KEY_TAGS, null)) {
      _jsonSet(KEY_TAGS, ['易混淆', '死记硬背', '高频考点']);
    }
    if (!_jsonGet(KEY_STATS, null)) {
      _jsonSet(KEY_STATS, { totalDone: 0, totalSessions: 0 });
    }
    if (!_jsonGet(KEY_WRONG_DETAIL, null)) {
      _jsonSet(KEY_WRONG_DETAIL, {});
    }
    if (!_jsonGet(KEY_QUESTION_META, null)) {
      _jsonSet(KEY_QUESTION_META, {});
    }
    if (!_jsonGet(KEY_PREF, null)) {
      _jsonSet(KEY_PREF, { darkMode: false, hotkeyEnabled: true, autoJumpDelay: 1200, randomOptions: false });
    }
    // 清理废弃字段
    const deprecatedKeys = [
      'eq_spaced_repeat',
      'spacedIntensity', 'wrongThreshold', 'insertMode',
      'spacedEnabled', 'preferRecentWrongs', 'preferAllHistoryWrongs'
    ];
    if (_lsAvailable) {
      deprecatedKeys.forEach(k => {
        try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
      });
      const pref = getPref();
      let changed = false;
      deprecatedKeys.forEach(k => { if (k in pref) { delete pref[k]; changed = true; } });
      if (changed) _jsonSet(KEY_PREF, pref);
    }
  }
  // ============ 作答记录 ============
  function saveAnswer(id, value) {
    if (id === undefined || id === null) return;
    _set(PREFIX_ANS + id, value || '');
    if (value && value.length) {
      const key = PREFIX_OPT + id;
      let o = _jsonGet(key, {});
      value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        .forEach(p => { o[p] = (o[p] || 0) + 1; });
      _jsonSet(key, o);
    }
  }
  function getAnswer(id) { return _get(PREFIX_ANS + id) || ''; }
  function removeAnswer(id) { _remove(PREFIX_ANS + id); }
  function clearAllAnswers() {
    if (_lsAvailable) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(PREFIX_ANS) || k.startsWith(PREFIX_OPT))) {
          try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
        }
      }
    } else {
      Object.keys(_memFallback).forEach(k => {
        if (k.startsWith(PREFIX_ANS) || k.startsWith(PREFIX_OPT)) {
          delete _memFallback[k];
        }
      });
    }
  }
  function getOptionStats(id) {
    return _jsonGet(PREFIX_OPT + id, {});
  }
  // ============ 题目元数据 ============
  function getQuestionMeta() { return _jsonGet(KEY_QUESTION_META, {}); }
  function getQuestionData(id) {
    const m = getQuestionMeta();
    const k = String(id);
    return m[k] || { tags: [], collect: false, note: '' };
  }
  function setQuestionData(id, data) {
    const m = getQuestionMeta();
    const k = String(id);
    if (!m[k]) m[k] = { tags: [], collect: false, note: '' };
    Object.assign(m[k], data);
    _jsonSet(KEY_QUESTION_META, m);
  }
  function toggleTag(id, tag) {
    const m = getQuestionMeta();
    const k = String(id);
    if (!m[k]) m[k] = { tags: [], collect: false, note: '' };
    const idx = m[k].tags.indexOf(tag);
    if (idx >= 0) m[k].tags.splice(idx, 1);
    else m[k].tags.push(tag);
    _jsonSet(KEY_QUESTION_META, m);
    return m[k].tags;
  }
  function toggleCollect(id) {
    const m = getQuestionMeta();
    const k = String(id);
    if (!m[k]) m[k] = { tags: [], collect: false, note: '' };
    m[k].collect = !m[k].collect;
    _jsonSet(KEY_QUESTION_META, m);
    return m[k].collect;
  }
  function saveNote(id, note) {
    const m = getQuestionMeta();
    const k = String(id);
    if (!m[k]) m[k] = { tags: [], collect: false, note: '' };
    m[k].note = note || '';
    _jsonSet(KEY_QUESTION_META, m);
  }
  // ============ 错题管理 ============
  function getWrongList() { return _jsonGet(KEY_WRONG, []); }
  function addWrong(id) {
    const list = getWrongList();
    if (!list.includes(id)) { list.push(id); _jsonSet(KEY_WRONG, list); }
    _incWrongDetail(id);
  }
  function removeWrong(id) {
    const list = getWrongList().filter(w => w !== id);
    _jsonSet(KEY_WRONG, list);
  }
  function clearAllWrong() {
    _remove(KEY_WRONG);
    _remove(KEY_WRONG_DETAIL);
  }
  function getWrongDetail() { return _jsonGet(KEY_WRONG_DETAIL, {}); }
  function _incWrongDetail(id) {
    const d = getWrongDetail();
    if (!d[id]) d[id] = { totalAttempts: 0, wrongCount: 0, lastWrongTime: 0, wrongRate: 0 };
    d[id].wrongCount++;
    d[id].lastWrongTime = Date.now();
    if (d[id].totalAttempts > 0) d[id].wrongRate = Number((d[id].wrongCount / d[id].totalAttempts).toFixed(4));
    _jsonSet(KEY_WRONG_DETAIL, d);
  }
  function recordAttempt(id, isCorrect) {
    const d = getWrongDetail();
    if (!d[id]) d[id] = { totalAttempts: 0, wrongCount: 0, lastWrongTime: 0, wrongRate: 0 };
    d[id].totalAttempts++;
    d[id].wrongRate = Number((d[id].wrongCount / d[id].totalAttempts).toFixed(4));
    _jsonSet(KEY_WRONG_DETAIL, d);
  }
  // ============ 进度管理 ============
  function saveProgress(data) { _jsonSet(KEY_PROGRESS, data); }
  function getProgress() { return _jsonGet(KEY_PROGRESS, {}); }
  function clearProgress() { _remove(KEY_PROGRESS); }
  // ============ 标签库 ============
  function getTags() { return _jsonGet(KEY_TAGS, ['易混淆', '死记硬背', '高频考点']); }
  function addTag(tag) {
    let ts = getTags();
    if (!ts.includes(tag)) { ts.push(tag); _jsonSet(KEY_TAGS, ts); }
    return ts;
  }
  // ============ 用户偏好 ============
  function getPref() { return _jsonGet(KEY_PREF, {}); }
  function setPref(obj) {
    const cur = getPref();
    Object.assign(cur, obj);
    _jsonSet(KEY_PREF, cur);
  }
  // ============ 全局统计 ============
  function getStats() { return _jsonGet(KEY_STATS, { totalDone: 0, totalSessions: 0 }); }
  function addSessionStat() {
    const s = getStats();
    s.totalSessions = (s.totalSessions || 0) + 1;
    s.totalDone = 0;
    if (typeof questionList !== 'undefined' && questionList) {
      questionList.forEach(q => { if (getAnswer(q.id)) s.totalDone++; });
    }
    _jsonSet(KEY_STATS, s);
  }
  // ============ 最后一期报告 ============
  function saveLastReport(data) { _jsonSet(KEY_LAST_REPORT, data); }
  function getLastReport() { return _jsonGet(KEY_LAST_REPORT, null); }
  // ============ v7.0 答案判定：统一预处理 ============
  /**
   * 规范化答案字符串：去除前后空格、统一大写
   * @param {string} s
   * @returns {string}
   */
  function normalize(s) {
    if (typeof s !== 'string') return '';
    return s.trim().toUpperCase();
  }
  /**
   * 多选题计分规则 v7.0
   * - 全选正确：得分 (isExactlyCorrect = true)
   * - 部分正确但无错误：partialCorrect
   * - 有错选或漏选：错误
   * @param {string} id
   * @param {string} userAns
   * @returns {{ isExactlyCorrect: boolean, isPartialCorrect: boolean, isWrong: boolean }}
   */
  function checkCorrectMulti(id, userAns) {
    const q = (typeof questionList !== 'undefined' && questionList)
      ? questionList.find(it => it && it.id === id) : null;
    if (!q || !userAns) return { isExactlyCorrect: false, isPartialCorrect: false, isWrong: true };
    const ref = normalize(q.answer || '');
    const usr = normalize(userAns);
    const refSet = new Set(ref.split(',').map(s => s.trim()).filter(Boolean));
    const usrSet = new Set(usr.split(',').map(s => s.trim()).filter(Boolean));
    if (refSet.size === 0) return { isExactlyCorrect: false, isPartialCorrect: false, isWrong: true };
    // 检查是否有错误选项（用户选了参考答案中没有的）
    let hasWrong = false;
    for (const u of usrSet) {
      if (!refSet.has(u)) { hasWrong = true; break; }
    }
    // 检查是否全对
    let allCorrect = true;
    if (usrSet.size !== refSet.size) allCorrect = false;
    if (allCorrect) {
      for (const r of refSet) { if (!usrSet.has(r)) { allCorrect = false; break; } }
    }
    if (allCorrect && !hasWrong) {
      return { isExactlyCorrect: true, isPartialCorrect: false, isWrong: false };
    }
    // 部分正确（无错选，但漏选）
    if (!hasWrong && usrSet.size > 0) {
      return { isExactlyCorrect: false, isPartialCorrect: true, isWrong: false };
    }
    return { isExactlyCorrect: false, isPartialCorrect: false, isWrong: true };
  }
  /**
   * 通用答案判定（保持向后兼容）
   * @param {string} id
   * @param {string} userAns
   * @returns {boolean}
   */
  function checkCorrect(id, userAns) {
    const q = (typeof questionList !== 'undefined' && questionList)
      ? questionList.find(it => it && it.id === id) : null;
    if (!q || !userAns) return false;
    const ref = normalize(q.answer || '');
    const usr = normalize(userAns);
    switch (q.type) {
      case 'radio':
      case 'judge':
        return usr === ref;
      case 'checkbox': {
        const result = checkCorrectMulti(id, userAns);
        return result.isExactlyCorrect;
      }
      case 'fill': {
        const refs = (q.answer || '').split('、').map(s => normalize(s)).filter(Boolean);
        const ups = userAns.split(/[、,]/).map(s => normalize(s)).filter(Boolean);
        if (refs.length === 1) return usr.includes(refs[0]);
        if (ups.length < refs.length) return false;
        for (let i = 0; i < refs.length; i++) {
          if (!ups[i] || !ups[i].includes(refs[i])) return false;
        }
        return true;
      }
    }
    return false;
  }
  /** 完整答题流程 */
  function submitAnswer(id, userAns) {
    if (!userAns || id === undefined || id === null) return { correct: false, multi: null };
    saveAnswer(id, userAns);
    const q = (typeof questionList !== 'undefined' && questionList)
      ? questionList.find(it => it && it.id === id) : null;
    const correct = checkCorrect(id, userAns);
    recordAttempt(id, correct);
    if (correct) { removeWrong(id); }
    else { addWrong(id); }
    // 多选题详细结果
    let multi = null;
    if (q && q.type === 'checkbox') {
      multi = checkCorrectMulti(id, userAns);
    }
    return { correct, multi };
  }
  // ============ 公开 API ============
  return {
    init,
    saveAnswer, getAnswer, removeAnswer, clearAllAnswers, getOptionStats,
    getQuestionMeta, getQuestionData, setQuestionData,
    toggleTag, toggleCollect, saveNote,
    getWrongList, addWrong, removeWrong, clearAllWrong,
    getWrongDetail, recordAttempt,
    saveProgress, getProgress, clearProgress,
    getTags, addTag,
    getPref, setPref,
    getStats, addSessionStat,
    saveLastReport, getLastReport,
    checkCorrect, checkCorrectMulti, submitAnswer,
    normalize,
    get lsAvailable() { return _lsAvailable; }
  };
})();