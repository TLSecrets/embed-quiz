/* ============================================
   common.js - 通用工具函数 (v3.0 流式出题重构)
   
   【v3.0 重大变更】
   - 废弃 insertSpacedReviews() 一次性预生成方案
   - 新增 getSpacedReviewPool() 获取可按需取用的复习错题池
   - 新增 popNextSpacedQ() 从池中弹出下一道待复习题（流式单题获取）
   - 新增 shouldInsertSpaced() 判断当前位置是否应插入复习题
   - 动态流式出题核心：每答完 N 道新题，从池中实时取一道插入
   
   【保留功能】
   - shuffleOptionsIfEnabled / restoreOriginalAnswer 选项打乱
   - drawScoreRing / drawTrendChart Canvas 图表
   - filterQuestions / shuffle 基础工具
   ============================================ */
const App = {
  /** 按题型筛选 */
  filterQuestions(type) {
    if (type === 'all' || !type) return [...questionList];
    return questionList.filter(q => q.type === type);
  },

  /** Fisher-Yates 洗牌 */
  shuffle(arr) {
    const r = [...arr];
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  },

  getTypeName(t) {
    const m = { radio:'单选题', checkbox:'多选题', fill:'填空题', judge:'判断题', all:'全部' };
    return m[t] || t;
  },

  getTypeIcon(t) {
    const m = { radio:'🔘', checkbox:'☑️', fill:'✍️', judge:'⚖️', all:'📋' };
    return m[t] || '❓';
  },

  formatAnswer(q) {
    const a = q.answer;
    switch (q.type) {
      case 'radio': return a + '. ' + (q.options[a.charCodeAt(0)-65] || a);
      case 'judge': return a === 'A' ? '对（A）' : '错（B）';
      case 'checkbox':
        return a.split(',').map(l=>l.trim()+'. '+(q.options[l.trim().charCodeAt(0)-65]||l.trim())).join('；');
      case 'fill': return a.replace(/、/g, '；');
    }
    return a;
  },

  setImageSrc(imgEl, src) {
    if (!src) {
      imgEl.style.display = 'none';
      imgEl.src = '';
      return;
    }
    imgEl.onerror = function() {
      this.style.display = 'block';
      this.style.background = '#f0ebe3';
      this.style.minHeight = '60px';
      this.style.alt = '🖼 图片加载失败：' + src;
      this.src = '';
    };
    imgEl.onload = function() {
      this.style.display = 'block';
      this.style.background = '';
      this.style.minHeight = '';
    };
    imgEl.src = src;
  },

  // ===================== 选项随机打乱 =====================
  /**
   * 对题目选项进行随机打乱，返回 { options, labels, mapping, reverseMapping }
   * - mapping: 原标签(A/B/C/D) → 新标签
   * - reverseMapping: 新标签 → 原标签（用于还原用户答案）
   */
  shuffleOptionsIfEnabled(q) {
    const pref = (typeof Storage !== 'undefined') ? Storage.getPref() : {};
    if (!pref.randomOptions || q.type === 'fill' || q.type === 'judge') {
      const labels = ['A','B','C','D'].slice(0, q.options.length);
      const mapping = {};
      labels.forEach(l => mapping[l] = l);
      return { options: [...q.options], labels, mapping, reverseMapping: { ...mapping } };
    }
    const indices = q.options.map((_, i) => i);
    const shuffled = this.shuffle(indices);
    const labels = ['A','B','C','D'];
    const newOptions = shuffled.map(i => q.options[i]);
    const mapping = {};
    const reverseMapping = {};
    shuffled.forEach((origIdx, newIdx) => {
      const origLabel = labels[origIdx];
      const newLabel = labels[newIdx];
      mapping[origLabel] = newLabel;
      reverseMapping[newLabel] = origLabel;
    });
    return { options: newOptions, labels: labels.slice(0, q.options.length), mapping, reverseMapping };
  },

  /** 将用户按打乱后标签选择的答案，还原为原始标签答案 */
  restoreOriginalAnswer(userNewAns, reverseMapping) {
    if (!userNewAns || !reverseMapping) return userNewAns;
    return userNewAns.split(',').map(s => {
      const trimmed = s.trim().toUpperCase();
      return reverseMapping[trimmed] || trimmed;
    }).join(',');
  },

  // ================================================================
  //  =====  v3.0 流式动态间隔重复出题——核心重构  =====
  //  设计思路：
  //    不再 buildList() 一次性生成全部题目，改为维护两个队列：
  //    - newQueue: 待出的普通新题
  //    - spacedPool: 待复习的错题池（按遗忘权重排序）
  //    每答完一道新题，计数器+1；每 N 道新题后，从池中取出1道
  //    错题动态插入流中，真正实现艾宾浩斯间隔重复。
  // ================================================================

  /**
   * 构建符合条件（题型+阈值）的复习错题池
   * 返回按遗忘权重降序排列的错题ID数组
   * @param {string|null} typeFilter - 'radio'|'checkbox'|'fill'|'judge'|null
   * @param {Set} excludeIds - 已在队列中的题目ID集合（去重）
   */
  getSpacedReviewPool(typeFilter, excludeIds) {
    const pref = Storage.getPref();
    const threshold = (pref.wrongThreshold !== undefined ? pref.wrongThreshold : 50) / 100;
    const detail = Storage.getWrongDetail();
    const sd = Storage.getSpacedData();
    const allWrongs = Storage.getWrongList();

    const candidates = allWrongs.filter(id => {
      // 去重
      if (excludeIds && excludeIds.has(id)) return false;
      // 题型强隔离
      if (typeFilter) {
        const q = questionList.find(qq => qq.id === id);
        if (!q || q.type !== typeFilter) return false;
      }
      // 错题准入阈值：仅正确率 ≤ 阈值的纳入
      const d = detail[id];
      if (d && d.totalAttempts > 0) {
        const correctRate = 1 - (d.wrongRate || 0);
        if (correctRate > threshold) return false;
      }
      // 间隔到期检查：过了复习间隔的才纳入
      const entry = sd[id];
      if (entry && entry.lastReview > 0) {
        const intervalMs = entry.interval * 24 * 60 * 60 * 1000;
        if (Date.now() - entry.lastReview < intervalMs) return false;
      }
      return true;
    });

    // 按遗忘权重降序排序
    candidates.sort((a, b) => (sd[b]?.weight || 0) - (sd[a]?.weight || 0));
    return candidates;
  },

  /**
   * 判断当前位置是否应插入一道复习错题
   * @param {number} newAnsweredCount - 已作答的新题数
   * @param {number} insertEvery - 每 N 道新题插入1道
   */
  shouldInsertSpaced(newAnsweredCount, insertEvery) {
    if (insertEvery <= 0) return false;
    return newAnsweredCount > 0 && newAnsweredCount % insertEvery === 0;
  },

  /**
   * 从复习池中取出下一道待复习题（题目对象），同时从池中移除
   * @param {Array} pool - 复习池ID数组（会被原地修改）
   * @returns {object|null} 题目对象
   */
  popNextSpacedQ(pool) {
    while (pool.length > 0) {
      const id = pool.shift();
      const q = questionList.find(qq => qq.id === id);
      if (q) return q;
    }
    return null;
  },

  // ===================== 环形得分图 =====================
  drawScoreRing(canvas, score, total) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth || 140;
    const h = canvas.height = canvas.offsetHeight || 140;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 12;
    ctx.clearRect(0, 0, w, h);
    const pct = total > 0 ? score / total : 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#e0dcd3';
    ctx.stroke();
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * pct;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.lineWidth = 10;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    if (pct >= 0.8) { grad.addColorStop(0, '#52b788'); grad.addColorStop(1, '#2d6a4f'); }
    else if (pct >= 0.6) { grad.addColorStop(0, '#52b788'); grad.addColorStop(1, '#e09f3e'); }
    else if (pct >= 0.3) { grad.addColorStop(0, '#e09f3e'); grad.addColorStop(1, '#c1292e'); }
    else { grad.addColorStop(0, '#c1292e'); grad.addColorStop(1, '#f87171'); }
    ctx.strokeStyle = grad;
    ctx.stroke();
    const tc = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#333';
    ctx.fillStyle = tc;
    ctx.font = 'bold 1.6rem ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((pct * 100).toFixed(1) + '%', cx, cy);
  },

  // ===================== 趋势折线图 =====================
  drawTrendChart(canvas, data) {
    if (!canvas) return;
    if (!data || data.length === 0) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text2').trim() || '#999';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无练习记录，开始刷题后将生成趋势图', canvas.width/2, canvas.height/2);
      return;
    }
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth || 600;
    const h = canvas.height = canvas.offsetHeight || 180;
    const pad = { top: 16, right: 20, bottom: 32, left: 44 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;
    ctx.clearRect(0, 0, w, h);
    const vals = data.map(d => d.accuracy);
    const textColor = getComputedStyle(document.body).getPropertyValue('--text2').trim() || '#666';
    const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#4a7c59';
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ph / 4) * i;
      ctx.fillText((100 - i * 25) + '%', pad.left - 6, y + 3);
      ctx.beginPath();
      ctx.strokeStyle = '#eee';
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }
    if (vals.length < 1) return;
    const stepX = vals.length === 1 ? pw / 2 : pw / Math.max(vals.length - 1, 1);
    ctx.beginPath();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    vals.forEach((v, i) => {
      const x = vals.length === 1 ? pad.left + pw / 2 : pad.left + i * stepX;
      const y = pad.top + ph * (1 - v / 100);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    vals.forEach((v, i) => {
      const x = vals.length === 1 ? pad.left + pw / 2 : pad.left + i * stepX;
      const y = pad.top + ph * (1 - v / 100);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();
    });
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.font = '9px sans-serif';
    data.forEach((d, i) => {
      if (i % Math.max(1, Math.ceil(data.length / 8)) === 0 || i === data.length - 1) {
        const x = vals.length === 1 ? pad.left + pw / 2 : pad.left + i * stepX;
        ctx.fillText(d.date, x, h - 8);
      }
    });
  },

  // ===================== 错题权重 =====================
  getWrongWeight(id) {
    const detail = Storage.getWrongDetail();
    const sd = Storage.getSpacedData();
    const d = detail[id] || { wrongCount: 0, wrongRate: 0 };
    const s = sd[id] || { weight: 1 };
    return {
      wrongCount: d.wrongCount,
      wrongRate: d.wrongRate,
      spacedWeight: s.weight,
      score: d.wrongCount * 10 + d.wrongRate * 100 + s.weight * 5
    };
  },

  /** 按错误频次排序 */
  getFreqSortedWrongs(wrongIds, sortBy, order) {
    const detail = Storage.getWrongDetail();
    return [...wrongIds].sort((a, b) => {
      const da = detail[a] || { wrongCount: 0, wrongRate: 0 };
      const db = detail[b] || { wrongCount: 0, wrongRate: 0 };
      const va = sortBy === 'rate' ? da.wrongRate : da.wrongCount;
      const vb = sortBy === 'rate' ? db.wrongRate : db.wrongCount;
      return order === 'asc' ? va - vb : vb - va;
    });
  }
};
