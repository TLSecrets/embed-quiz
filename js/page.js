/* ============================================
   page.js - 答题页面核心编排器 v7.0
   【v7.0 变更】
   - 无重复随机抽题算法：Picker.build() 替代原手动索引
   - 局部渲染：只渲染当前题，不创建全部DOM
   - SVG序列号组件（与SVG序号钩子协同）
   - 考试模式：答案藏于内存，提交后批改
   - 移除间隔重复相关逻辑
   【v5.0 保留】
   - 选项随机打乱（双向映射）
   - 多空答案判定（fill 分隔符）
   ============================================ */
(function() {
  'use strict';
  // ============ 全局状态 ============
  let qIndex = 0;
  let currentMode = 'normal'; // normal | review | exam
  let modeConfig = {};
  let shuffledCache = {}; // { q.id: { options, labels, mapping, reverseMapping } }
  let examUserAnswers = {}; // 考试模式内存答案
  let lastSubmittedAns = {}; // { q.id: answerString } 防止重复提交
  let sessionResults = null; // 最近一次会话结果
  let isExamSubmitted = false;
  let qList = []; // 当前会话题目列表（Picker.build 产出物）
  // v7.0 与 v6.0 差异：不再使用 allQuestions / currentPool / usedPool / spacedPool 等六池管理
  // 全部使用 Picker.build(sourceList, random, limit) 一步产出
  // ============ 初始化 ============
  function initPage() {
    Storage.init();
    // 【v7.1】解析 URL 参数，设置初始题型筛选按钮
    (function applyUrlParams() {
      const params = new URLSearchParams(window.location.search);
      const urlType = params.get('type');
      if (urlType && ['radio', 'checkbox', 'fill', 'judge'].includes(urlType)) {
        document.querySelectorAll('.eq-type-btn').forEach(b => b.classList.remove('active'));
        const target = document.querySelector('.eq-type-btn[data-type="' + urlType + '"]');
        if (target) { target.classList.add('active'); }
      }
    })();
    const urlMode = (function() {
      const p = new URLSearchParams(window.location.search);
      return p.get('mode') || '';
    })();
    window._PAGE_MODE = urlMode || '';
    modeConfig = {
      normal:   { answerAfter: true,  random: true,  limit: 0    },
      review:   { answerAfter: false, random: false, limit: 0    },
      exam:     { answerAfter: false, random: true,  limit: 0    }
    };
    loadQuestions();
    bindEvents();
    applyMode('normal');
    restoreProgressOrStart();
    // 错题/收藏模式：显示返回按钮
    if (window._PAGE_MODE === 'wrong') {
      const btn = document.getElementById('eqBtnBackWrong');
      if (btn) { btn.style.display = 'inline-block'; btn.href = 'wrong.html'; }
    }
    if (window._PAGE_MODE === 'collect') {
      const btn = document.getElementById('eqBtnBackCollect');
      if (btn) { btn.style.display = 'inline-block'; btn.href = 'collect.html'; }
    }
  }
  // ============ 加载题库 ============
  function loadQuestions() {
    // 由页面侧注入 window.__RAW_QUESTIONS__（脚本加载晚于内联题库时用）
    if (window.__RAW_QUESTIONS__ && Array.isArray(window.__RAW_QUESTIONS__) && window.__RAW_QUESTIONS__.length > 0) {
      questionList = window.__RAW_QUESTIONS__;
    }
    if (!questionList || !Array.isArray(questionList) || questionList.length === 0) {
      showError(I18N.t('noData'));
      return;
    }
    // 自动修复ID（无ID自动分配）
    questionList.forEach((q, i) => {
      if (q && typeof q.id === 'undefined') q.id = 'q' + (i + 1);
    });
  }
  // ============ 模式管理 ============
  function applyMode(mode) {
    currentMode = mode;
    const cfg = modeConfig[mode] || modeConfig.normal;
    // 重建qList
    rebuildQList(cfg);
    qIndex = 0;
    shuffledCache = {};
    examUserAnswers = {};
    isExamSubmitted = false;
    sessionResults = null;
    lastSubmittedAns = {};
    if (cfg.answerAfter) {
      // normal 模式：带答案面板
    }
    document.querySelectorAll('.eq-mode-tab').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-mode') === mode);
    });
    // 更新UI
    updateModeUI();
    renderCurrent();
    updateProgressUI();
    window._appHooks.onModeChange(mode);
  }
  function rebuildQList(cfg) {
    const filterType = getActiveFilter();
    let source = App.filterQuestions(filterType, questionList);
    // 错题模式：仅保留存在错误记录的题目
    if (window._PAGE_MODE === 'wrong') {
      const wrongIds = Storage.getWrongList();
      const wrongIdSet = new Set(wrongIds);
      source = source.filter(q => wrongIdSet.has(q.id));
      console.log('[rebuildQList] 错题模式：' + wrongIds.length + '个错题ID→匹配' + source.length + '道');
      if (source.length === 0) {
        alert(I18N.t('noWrongTips') || '暂无错题，先去刷题吧！');
        window.location.href = 'index.html';
        qList = [];
        return;
      }
    }
    // 收藏模式：仅保留 collect=true 的题目
    if (window._PAGE_MODE === 'collect') {
      source = source.filter(q => {
        const meta = Storage.getQuestionData(q.id);
        return meta && meta.collect === true;
      });
      console.log('[rebuildQList] 收藏模式：' + source.length + ' 道收藏题目');
    }
    qList = Picker.build(source, cfg.random, cfg.limit, filterType);
    if (filterType !== 'all' && qList.length > 0) {
      const mismatch = qList.filter(q => q.type !== filterType);
      if (mismatch.length > 0) {
        console.error('[rebuildQList] 严重错误：Picker.build 输出仍包含不匹配题型的题目！', mismatch.map(q => '#'+q.id+'('+q.type+')').join(', '));
        qList = qList.filter(q => q.type === filterType);
      }
    }
    console.log('[rebuildQList] filterType="' + filterType + '" → ' + qList.length + ' 道题');
  }
  function getActiveFilter() {
    const active = document.querySelector('.eq-type-btn.active');
    return active ? active.getAttribute('data-type') || 'all' : 'all';
  }
  // ============ 进度恢复 ============
  function restoreProgressOrStart() {
    const prog = Storage.getProgress();
    const filterType = getActiveFilter();
    const savedFilterOk = !prog.filterType || prog.filterType === filterType || filterType === 'all';
    if (prog && prog.qListIds && prog.qListIds.length > 0 && prog.mode === currentMode && savedFilterOk) {
      const ids = prog.qListIds;
      let restored = ids.map(id => questionList.find(q => q && q.id === id)).filter(Boolean);
      if (filterType !== 'all') {
        const before = restored.length;
        restored = restored.filter(q => q.type === filterType);
        if (restored.length < before) {
          console.warn('[restoreProgress] 恢复进度时过滤掉 ' + (before - restored.length) + ' 道不匹配题型 "' + filterType + '" 的题目');
        }
      }
      if (restored.length > 0) {
        qList = restored;
        qIndex = Math.min(prog.qIndex || 0, qList.length - 1);
        if (prog.shuffledCache) shuffledCache = prog.shuffledCache;
        if (prog.examUserAnswers) examUserAnswers = prog.examUserAnswers;
        renderCurrent();
        updateProgressUI();
        return;
      }
      console.log('[restoreProgress] 恢复后题目池为空，回退重建');
    }
    rebuildQList(modeConfig[currentMode]);
  }
  function saveProgressNow() {
    Storage.saveProgress({
      mode: currentMode,
      qIndex: qIndex,
      qListIds: qList.map(q => q.id),
      shuffledCache: shuffledCache,
      examUserAnswers: examUserAnswers,
      filterType: getActiveFilter(),
      timestamp: Date.now()
    });
  }
  // ============ 题目渲染（单题懒加载） ============
  function renderCurrent() {
    if (!qList || qList.length === 0) {
      showError(I18N.t('noData'));
      return;
    }
    if (qIndex < 0) qIndex = 0;
    if (qIndex >= qList.length) qIndex = qList.length - 1;
    const q = qList[qIndex];
    if (!q) { qIndex = 0; return; }
    // 确保shuffle缓存
    if (!shuffledCache[q.id]) {
      shuffledCache[q.id] = App.shuffleOptionsIfEnabled(q);
    }
    const shuffled = shuffledCache[q.id];
    const userAns = currentMode === 'exam'
      ? (examUserAnswers[q.id] || '')
      : (Storage.getAnswer(q.id) || '');
    // 渲染题目区
    const titleEl = document.getElementById('eqQuestionTitle');
    if (titleEl) {
      titleEl.innerHTML = `<span class="eq-q-index">#${qIndex + 1}/${qList.length}</span>
        <span class="eq-q-type">${App.getTypeIcon(q.type)} ${App.getTypeName(q.type)}</span>
        <span class="eq-q-text">${Renderer._escHtml(q.title || '')}</span>`;
    }
    // 图片
    const imgWrapper = document.getElementById('eqQuestionImgWrap');
    const imgEl = document.getElementById('eqQuestionImg');
    if (imgWrapper && imgEl) {
      if (q.img) {
        imgWrapper.style.display = 'block';
        App.setImageSrc(imgEl, q.img);
      } else {
        imgWrapper.style.display = 'none';
      }
    }
    // 选项区
    const area = document.getElementById('eqAnswerArea');
    if (area) {
      Renderer.renderAnswerArea(area, q, shuffled, userAns, currentMode);
    }
    // 答案面板
    const box = document.getElementById('eqAnswerBox');
    if (box) {
      const showAns = (currentMode === 'normal' || currentMode === 'review') && !!userAns;
      Renderer.renderAnswerBox(box, q, userAns, shuffled, showAns, currentMode);
    }
    // 笔记标签区
    const ntArea = document.getElementById('eqNoteTag');
    if (ntArea) {
      Renderer.renderNoteTag(ntArea, q, currentMode);
    }
    // 答题卡
    const sheetGrid = document.getElementById('eqSheetGrid');
    if (sheetGrid) {
      Renderer.renderSheet(sheetGrid, qList, qIndex, currentMode, examUserAnswers);
    }
    // 导航按钮状态
    updateNavButtons();
    // SVG 序号钩子
    updateSequenceHooks();
    // 进度持久化
    saveProgressNow();
    // 触发钩子
    window._appHooks.onQuestionChange(qIndex, qList.length, q, shuffled, currentMode);
  }
  function updateNavButtons() {
    const btnPrev = document.getElementById('eqBtnPrev');
    const btnNext = document.getElementById('eqBtnNext');
    if (btnPrev) btnPrev.disabled = qIndex <= 0;
    if (btnNext) btnNext.disabled = qIndex >= qList.length - 1;
  }
  function updateSequenceHooks() {
    if (!qList) return;
    const seqs = qList.map((q, i) => ({
      index: i,
      qid: q ? q.id : null,
      type: q ? q.type : null,
      solved: currentMode === 'exam'
        ? !!(examUserAnswers[q.id])
        : !!(Storage.getAnswer(q.id) || ''),
      mapping: q && shuffledCache[q.id] ? shuffledCache[q.id].mapping : {}
    }));
    window._appHooks.onSequenceChange(seqs);
  }
  // ============ 用户交互 ============
  // 单选
  window.selOpt = function(el, label) {
    const q = qList[qIndex];
    if (!q || isExamSubmitted) return;
    const shuffled = shuffledCache[q.id];
    const origLabel = shuffled.reverseMapping[label] || label;
    const prevAns = currentMode === 'exam' ? examUserAnswers[q.id] : Storage.getAnswer(q.id);
    if (prevAns === origLabel) return; // 相同不重复提交
    // 更新UI
    document.querySelectorAll('#eqAnswerArea .eq-opt-item').forEach(e => e.classList.remove('eq-selected'));
    if (el) el.classList.add('eq-selected');
    // 保存答案
    if (currentMode === 'exam') {
      examUserAnswers[q.id] = origLabel;
    } else {
      Storage.saveAnswer(q.id, origLabel);
    }
    handleSubmit(origLabel);
  };
  // 多选
  window.selChk = function(el, label) {
    const q = qList[qIndex];
    if (!q || isExamSubmitted) return;
    const sels = [];
    document.querySelectorAll('#eqAnswerArea .eq-opt-item.eq-selected').forEach(e => sels.push(e.getAttribute('data-opt')));
    const shuffled = shuffledCache[q.id];
    const origLabels = sels.map(l => shuffled.reverseMapping[l] || l).join(',');
    if (currentMode === 'exam') {
      examUserAnswers[q.id] = origLabels;
    } else {
      Storage.saveAnswer(q.id, origLabels);
    }
  };
  // 填空
  window.saveFill = function() {
    const q = qList[qIndex];
    if (!q || isExamSubmitted) return;
    const ta = document.getElementById('fillInput');
    if (!ta) return;
    const val = App.normalizeAnswer(ta.value);
    if (currentMode === 'exam') {
      examUserAnswers[q.id] = val;
    } else {
      Storage.saveAnswer(q.id, val);
    }
    handleSubmit(val);
  };
  // 判断
  window.selJudge = function(label) {
    const q = qList[qIndex];
    if (!q || isExamSubmitted) return;
    if (currentMode === 'exam') {
      examUserAnswers[q.id] = label;
    } else {
      Storage.saveAnswer(q.id, label);
    }
    // 更新按钮样式
    document.querySelectorAll('.eq-judge-btn').forEach(b => {
      b.classList.remove('eq-sel-right', 'eq-sel-wrong');
    });
    const btn = label === 'A'
      ? document.querySelector('.eq-judge-btn:first-child')
      : document.querySelector('.eq-judge-btn:last-child');
    if (btn) btn.classList.add(label === 'A' ? 'eq-sel-right' : 'eq-sel-wrong');
    handleSubmit(label);
  };
  function handleSubmit(userAns) {
    const q = qList[qIndex];
    if (!q || !userAns) return;
    // 防重复提交
    if (lastSubmittedAns[q.id] === userAns) {
      renderCurrent(); // 仅刷新UI
      return;
    }
    lastSubmittedAns[q.id] = userAns;
    const result = Storage.submitAnswer(q.id, userAns);
    // 更新答题卡
    const sheetGrid = document.getElementById('eqSheetGrid');
    if (sheetGrid) {
      Renderer.renderSheet(sheetGrid, qList, qIndex, currentMode, examUserAnswers);
    }
    // 刷新答案面板（非考试模式）
    if (currentMode !== 'exam') {
      const box = document.getElementById('eqAnswerBox');
      const shuffled = shuffledCache[q.id];
      if (box) Renderer.renderAnswerBox(box, q, userAns, shuffled, true, currentMode);
    }
    // 刷新当前视图
    renderCurrent();
    // 统计
    const totalDone = countDone();
    const totalCorrect = countCorrect();
    window._appHooks.onAnswer(qIndex, result.correct, totalCorrect, totalDone, false);
    updateProgressUI();
    // 自动跳转
    autoJumpNext(result.correct);
  }
  function countDone() {
    if (currentMode === 'exam') return Object.values(examUserAnswers).filter(a => !!a).length;
    let c = 0;
    qList.forEach(q => { if (Storage.getAnswer(q.id)) c++; });
    return c;
  }
  function countCorrect() {
    let c = 0;
    qList.forEach(q => {
      const ans = currentMode === 'exam' ? examUserAnswers[q.id] : Storage.getAnswer(q.id);
      if (ans && Storage.checkCorrect(q.id, ans)) c++;
    });
    return c;
  }
  function autoJumpNext(isCorrect) {
    const pref = Storage.getPref();
    if (pref.autoJumpDelay === 0) return; // 0=关闭自动跳转
    if (isCorrect || currentMode === 'review') {
      const delay = pref.autoJumpDelay || 1200;
      TimerManager.setTimeout(() => {
        if (qIndex < qList.length - 1) goNext();
      }, delay);
    }
  }
  // ============ 导航 ============
  window.goPrev = function() {
    if (qIndex > 0) { qIndex--; renderCurrent(); updateProgressUI(); }
  };
  window.goNext = function() {
    if (qIndex < qList.length - 1) { qIndex++; renderCurrent(); updateProgressUI(); }
  };
  window.jumpTo = function(idx) {
    if (idx >= 0 && idx < qList.length) { qIndex = idx; renderCurrent(); updateProgressUI(); }
  };
  // 键盘导航
  function onKeyDown(e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    const pref = Storage.getPref();
    if (!pref.hotkeyEnabled) return;
    switch (e.key) {
      case 'ArrowLeft': window.goPrev(); break;
      case 'ArrowRight': window.goNext(); break;
      case '1': case 'a': case 'A':
        clickOptByLabel('A'); break;
      case '2': case 'b': case 'B':
        clickOptByLabel('B'); break;
      case '3': case 'c': case 'C':
        clickOptByLabel('C'); break;
      case '4': case 'd': case 'D':
        clickOptByLabel('D'); break;
      case '5': case 'e': case 'E':
        clickOptByLabel('E'); break;
      case '6': case 'f': case 'F':
        clickOptByLabel('F'); break;
      case 'Enter':
        if (qList[qIndex].type === 'fill') window.saveFill();
        if (qIndex < qList.length - 1) window.goNext();
        break;
      case ' ':
        e.preventDefault();
        if (qIndex < qList.length - 1) window.goNext();
        break;
    }
  }
  function clickOptByLabel(label) {
    const el = document.querySelector(`#eqAnswerArea .eq-opt-item[data-opt="${label}"]`);
    if (el) el.click();
  }
  // ============ 模式切换 ============
  function switchMode(mode) {
    if (mode === currentMode) return;
    applyMode(mode);
  }
  // ============ 考试提交 ============
  window.submitExam = function() {
    if (currentMode !== 'exam' || isExamSubmitted) return;
    const total = qList.length;
    const done = countDone();
    const correct = countCorrect();
    isExamSubmitted = true;
    sessionResults = {
      mode: 'exam',
      _pageMode: window._PAGE_MODE || '',
      total: total,
      done: done,
      correct: correct,
      wrong: total - correct,
      score: total > 0 ? Math.round((correct / total) * 100) : 0,
      questions: qList.map(q => ({
        id: q.id,
        type: q.type,
        title: q.title,
        answer: q.answer,
        userAns: examUserAnswers[q.id] || '',
        correct: Storage.checkCorrect(q.id, examUserAnswers[q.id] || '')
      })),
      timestamp: Date.now()
    };
    // 将考试答案写入storage
    Object.keys(examUserAnswers).forEach(id => {
      Storage.saveAnswer(id, examUserAnswers[id]);
    });
    Storage.saveLastReport(sessionResults);
    Storage.addSessionStat();
    window._appHooks.onSessionComplete(sessionResults);
    updateProgressUI();
    // 切换到复盘视图
    showExamReport();
  };
  function showExamReport() {
    const overlay = document.getElementById('eqExamReport');
    if (!overlay) return;
    const r = sessionResults;
    if (!r) return;
    const scoreEl = overlay.querySelector('.eq-exam-score');
    if (scoreEl) scoreEl.textContent = r.score;
    const detailEl = overlay.querySelector('.eq-exam-detail');
    if (detailEl) {
      detailEl.innerHTML = `
        <div>✅ ${I18N.t('correct')}: ${r.correct}</div>
        <div>❌ ${I18N.t('wrong')}: ${r.wrong}</div>
        <div>📊 ${I18N.t('totalQ')}: ${r.total}</div>
        <div>📝 ${I18N.t('answered')}: ${r.done}</div>`;
    }
    overlay.style.display = 'flex';
  }
  window.closeExamReport = function() {
    const overlay = document.getElementById('eqExamReport');
    if (overlay) overlay.style.display = 'none';
    applyMode('review');
  };
  // ============ 标签/笔记/收藏 ============
  window.toggleTag = function(tag) {
    const q = qList[qIndex];
    if (!q) return;
    Storage.toggleTag(q.id, tag);
    renderCurrent();
  };
  window.addCustomTag = function() {
    const tag = prompt(I18N.t('addTagPrompt'));
    if (!tag) return;
    Storage.addTag(tag.trim());
    renderCurrent();
  };
  window.toggleCollect = function() {
    const q = qList[qIndex];
    if (!q) return;
    Storage.toggleCollect(q.id);
    renderCurrent();
  };
  window.saveNote = function() {
    const q = qList[qIndex];
    if (!q) return;
    const ta = document.getElementById('noteInput');
    if (ta) Storage.saveNote(q.id, ta.value);
  };
  // ============ 进度与统计 ============
  function updateProgressUI() {
    const bar = document.getElementById('eqProgressBar');
    const txt = document.getElementById('eqProgressText');
    const total = qList.length;
    const done = countDone();
    if (bar) bar.style.width = total > 0 ? (done / total * 100) + '%' : '0%';
    if (txt) txt.textContent = `${done}/${total}`;
    // 顶部统计
    const statEl = document.getElementById('eqTopStats');
    if (statEl) {
      const corr = countCorrect();
      statEl.textContent = `✅ ${corr} | ❌ ${done - corr} | 📊 ${done}/${total}`;
    }
    saveProgressNow();
    updateSequenceHooks();
  }
  function updateModeUI() {
    const tabs = document.querySelectorAll('.eq-mode-tab');
    tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-mode') === currentMode));
    const examBtns = document.querySelectorAll('.eq-exam-only');
    examBtns.forEach(el => el.style.display = currentMode === 'exam' ? '' : 'none');
    const normalBtns = document.querySelectorAll('.eq-non-exam');
    normalBtns.forEach(el => el.style.display = currentMode !== 'exam' ? '' : 'none');
  }
  // ============ 内联事件函数（供HTML onchange调用） ============
  window.setCustomCount = function() {
    const el = document.getElementById('customCount');
    if (el) {
      const v = parseInt(el.value) || 0;
      modeConfig[currentMode].limit = Math.max(0, Math.min(v, 167));
      rebuildQList(modeConfig[currentMode]);
      qIndex = 0;
      shuffledCache = {};
      renderCurrent();
      updateProgressUI();
    }
  };
  window.toggleRandom = function() {
    const el = document.getElementById('randomToggle');
    if (el) {
      modeConfig[currentMode].random = el.checked;
      rebuildQList(modeConfig[currentMode]);
      qIndex = 0;
      shuffledCache = {};
      renderCurrent();
      updateProgressUI();
    }
  };
  window.toggleOptRandom = function() {
    const el = document.getElementById('optRandomToggle');
    if (el) {
      Storage.setPref({ randomOptions: el.checked });
      shuffledCache = {};
      renderCurrent();
    }
  };
  // ============ 事件绑定 ============
  function bindEvents() {
    document.addEventListener('keydown', onKeyDown);
    // 模式切换
    document.querySelectorAll('.eq-mode-tab').forEach(el => {
      el.addEventListener('click', function() {
        const mode = this.getAttribute('data-mode');
        switchMode(mode);
      });
    });
    // 题型筛选
    document.querySelectorAll('.eq-type-btn').forEach(el => {
      el.addEventListener('click', function() {
        document.querySelectorAll('.eq-type-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        rebuildQList(modeConfig[currentMode]);
        qIndex = 0;
        shuffledCache = {};
        renderCurrent();
        updateProgressUI();
      });
    });
    // 导航按钮
    const btnPrev = document.getElementById('eqBtnPrev');
    const btnNext = document.getElementById('eqBtnNext');
    if (btnPrev) btnPrev.addEventListener('click', window.goPrev);
    if (btnNext) btnNext.addEventListener('click', window.goNext);
    // 考试提交
    const btnSubmit = document.getElementById('eqBtnSubmitExam');
    if (btnSubmit) btnSubmit.addEventListener('click', window.submitExam);
    // 考试报告关闭
    const btnClose = document.getElementById('eqBtnCloseReport');
    if (btnClose) btnClose.addEventListener('click', window.closeExamReport);
    // 重做按钮
    const btnRedo = document.getElementById('eqBtnRedo');
    if (btnRedo) btnRedo.addEventListener('click', function() {
      if (confirm(I18N.t('confirmRedo').replace('{done}', String(countDone())).replace('{total}', String(qList.length)))) {
        const ids = qList.map(q => q.id);
        if (currentMode === 'exam') examUserAnswers = {};
        ids.forEach(id => { Storage.clearAnswer(id); });
        qIndex = 0;
        shuffledCache = {};
        lastSubmittedAns = {};
        rebuildQList(modeConfig[currentMode]);
        renderCurrent();
        updateProgressUI();
      }
    });
    // 清除进度
    const btnClear = document.getElementById('eqBtnClearProgress');
    if (btnClear) btnClear.addEventListener('click', function() {
      if (confirm(I18N.t('clearProgressConfirm'))) {
        Storage.clearAllAnswers();
        Storage.clearProgress();
        examUserAnswers = {};
        shuffledCache = {};
        rebuildQList(modeConfig[currentMode]);
        qIndex = 0;
        lastSubmittedAns = {};
        renderCurrent();
        updateProgressUI();
      }
    });
    // 窗口关闭前清理定时器
    window.addEventListener('beforeunload', function() {
      TimerManager.clearAll();
      saveProgressNow();
    });
  }
  function showError(msg) {
    const area = document.getElementById('eqAnswerArea');
    if (area) area.innerHTML = `<div class="eq-error">${Renderer._escHtml(msg)}</div>`;
  }
  // ============ 公开API ============
  window.EQ = {
    init: initPage,
    switchMode: switchMode,
    getCurrentMode: function() { return currentMode; },
    getQList: function() { return qList; },
    getQIndex: function() { return qIndex; },
    getSessionResults: function() { return sessionResults; },
    rebuildQList: function() { rebuildQList(modeConfig[currentMode]); qIndex = 0; renderCurrent(); updateProgressUI(); }
  };
  // ============ 启动 ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();