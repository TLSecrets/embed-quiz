/* ============================================
   common.js - 通用工具函数 (v2.0 全面重构)
   渲染、图表、抽题、排序、选项打乱、
   间隔重复插入算法（题型匹配+替换/追加模式）
   
   【v2.0 修改点】
   - 增加 shuffleOptions: 选项随机打乱 + 原序映射
   - 增加 insertSpacedReviews: 间隔重复错题动态插入（题型匹配）
   - 增加 getWrongPoolByThreshold: 错题准入阈值过滤
   - drawTrendChart 增强：Y轴范围动态、数据标签
   - drawScoreRing 颜色调整
   - getSpacedQuestions 增加题型过滤参数
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

  /** 题型名称 */
  getTypeName(t) {
    const m = { radio:'单选题', checkbox:'多选题', fill:'填空题', judge:'判断题', all:'全部' };
    return m[t] || t;
  },

  /** 题型图标 */
  getTypeIcon(t) {
    const m = { radio:'🔘', checkbox:'☑️', fill:'✍️', judge:'⚖️', all:'📋' };
    return m[t] || '❓';
  },

  /** 格式化参考答案显示 */
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

  /** 图片渲染（含加载失败占位） */
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
      this.alt = '🖼 图片加载失败：' + src;
      this.src = '';
    };
    imgEl.onload = function() {
      this.style.display = 'block';
      this.style.background = '';
      this.style.minHeight = '';
    };
    imgEl.src = src;
  },

  // ===================== 选项随机打乱 v2.0 =====================
  /**
   * 对题目选项进行随机打乱，返回 { options, mapping }
   * mapping: { 'A':'B', 'B':'C', ... } 原标签→新标签
   * reverseMapping: { 'B':'A', 'C':'B', ... } 新标签→原标签（用于还原答案比对）
   * 不打乱时返回原序
   */
  shuffleOptionsIfEnabled(q) {
    const pref = (typeof Storage !== 'undefined') ? Storage.getPref() : {};
    if (!pref.randomOptions || q.type === 'fill' || q.type === 'judge') {
      // 不打乱
      const labels = ['A','B','C','D'].slice(0, q.options.length);
      const mapping = {};
      labels.forEach(l => mapping[l] = l);
      return { options: [...q.options], labels, mapping, reverseMapping: mapping };
    }
    const indices = q.options.map((_, i) => i);
    const shuffled = this.shuffle(indices);
    const labels = ['A','B','C','D'];
    const newOptions = shuffled.map(i => q.options[i]);
    const mapping = {};     // 原标签→新标签
    const reverseMapping = {}; // 新标签→原标签
    shuffled.forEach((origIdx, newIdx) => {
      const origLabel = labels[origIdx];
      const newLabel = labels[newIdx];
      mapping[origLabel] = newLabel;
      reverseMapping[newLabel] = origLabel;
    });
    return { options: newOptions, labels: labels.slice(0, q.options.length), mapping, reverseMapping };
  },

  /**
   * 将用户按新标签选择的答案还原为原标签答案，用于存储和判分
   * userNewAns: 'A' 或 'A,B'
   * reverseMapping: { 'A':'C', 'B':'A' ... }
   */
  restoreOriginalAnswer(userNewAns, reverseMapping) {
    if (!userNewAns || !reverseMapping) return userNewAns;
    return userNewAns.split(',').map(s => {
      const trimmed = s.trim().toUpperCase();
      return reverseMapping[trimmed] || trimmed;
    }).join(',');
  },

  // ===================== 间隔重复插入算法 v2.0 =====================
  /**
   * 从错题库中按准入阈值筛选待复习题目
   * typeFilter: 仅返回匹配题型（null则不限制）
   * priorityMode: 'recent' | 'all' | 'both'
   */
  getWrongPoolByThreshold(typeFilter, priorityMode) {
    const pref = Storage.getPref();
    const threshold = (pref.wrongThreshold !== undefined ? pref.wrongThreshold : 50) / 100;
    const detail = Storage.getWrongDetail();
    const sd = Storage.getSpacedData();
    const allWrongs = Storage.getWrongList();

    return allWrongs.filter(id => {
      // 题型匹配
      if (typeFilter) {
        const q = questionList.find(qq => qq.id === id);
        if (!q || q.type !== typeFilter) return false;
      }
      // 阈值筛选
      const d = detail[id];
      if (d && d.totalAttempts > 0) {
        const correctRate = 1 - (d.wrongRate || 0);
        if (correctRate > threshold) return false;
      }
      return true;
    }).sort((a, b) => {
      // 按遗忘权重降序
      const wa = (sd[a] && sd[a].weight) || 0;
      const wb = (sd[b] && sd[b].weight) || 0;
      return wb - wa;
    });
  },

  /**
   * 将待复习错题插入题目列表
   * @param {Array} baseList 原始题目列表
   * @param {string} typeFilter 当前题型筛选
   * @param {string} insertMode 'replace' | 'append'
   * @param {number} intensity 区间强度(1~10)
   * @returns {Array} 插入后的题目列表
   */
  insertSpacedReviews(baseList, typeFilter, insertMode, intensity) {
    const pool = this.getWrongPoolByThreshold(typeFilter === 'all' ? null : typeFilter, 'all');
    if (pool.length === 0) return baseList;

    // 去重：排除已在baseList中的题目
    const baseIds = new Set(baseList.map(q => q.id));
    const available = pool.filter(id => !baseIds.has(id));
    if (available.length === 0) return baseList;

    intensity = Math.max(1, Math.min(10, intensity || 3));
    const insertEvery = Math.max(1, Math.floor(10 / intensity)); // 每 N 道新题插入1道

    if (insertMode === 'replace') {
      // 模式1：替换模式——每隔 insertEvery 道替换1道为错题
      const result = [...baseList];
      let poolIdx = 0;
      for (let i = insertEvery - 1; i < result.length && poolIdx < available.length; i += insertEvery) {
        const wrongQ = questionList.find(q => q.id === available[poolIdx]);
        if (wrongQ) {
          result[i] = wrongQ;
          poolIdx++;
        }
      }
      return result;
    } else {
      // 模式2：追加模式——每隔 insertEvery 道插入1道错题，总量增加
      const result = [];
      let poolIdx = 0;
      for (let i = 0; i < baseList.length; i++) {
        result.push(baseList[i]);
        if ((i + 1) % insertEvery === 0 && poolIdx < available.length) {
          const wrongQ = questionList.find(q => q.id === available[poolIdx]);
          if (wrongQ) {
            result.push(wrongQ);
            poolIdx++;
          }
        }
      }
      // 末尾追加剩余的
      while (poolIdx < available.length) {
        const wrongQ = questionList.find(q => q.id === available[poolIdx]);
        if (wrongQ) result.push(wrongQ);
        poolIdx++;
      }
      return result;
    }
  },

  // ===================== 环形得分图 (Canvas) =====================
  drawScoreRing(canvas, score, total) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth || 140;
    const h = canvas.height = canvas.offsetHeight || 140;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 12;
    ctx.clearRect(0, 0, w, h);
    const pct = total > 0 ? score / total : 0;
    // 背景环
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#e0dcd3';
    ctx.stroke();
    // 进度弧
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
    // 中心文字
    const tc = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#333';
    ctx.fillStyle = tc;
    ctx.font = 'bold 1.6rem ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((pct * 100).toFixed(1) + '%', cx, cy);
  },

  // ===================== 趋势折线图 (Canvas) v2.0 增强 =====================
  drawTrendChart(canvas, data) {
    if (!canvas || !data || data.length === 0) {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text2').trim() || '#999';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('暂无练习记录，开始刷题后将生成趋势图', canvas.width/2, canvas.height/2);
      }
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

    // 坐标轴
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();

    // Y 轴标签
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

    // 折线
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

    // 数据点
    vals.forEach((v, i) => {
      const x = vals.length === 1 ? pad.left + pw / 2 : pad.left + i * stepX;
      const y = pad.top + ph * (1 - v / 100);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();
    });

    // X 轴标签（每5个显示一次日期）
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

  // ===================== 错题权重计算 =====================
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

  /** 按错误频次排序错题ID */
  getFreqSortedWrongs(wrongIds, sortBy, order) {
    const detail = Storage.getWrongDetail();
    return [...wrongIds].sort((a, b) => {
      const da = detail[a] || { wrongCount: 0, wrongRate: 0 };
      const db = detail[b] || { wrongCount: 0, wrongRate: 0 };
      const va = sortBy === 'rate' ? da.wrongRate : da.wrongCount;
      const vb = sortBy === 'rate' ? db.wrongRate : db.wrongCount;
      return order === 'asc' ? va - vb : vb - va;
    });
  },

  /** 获取间隔重复待复习题目（支持题型过滤） */
  getSpacedQuestions(wrongIds, intensity, typeFilter) {
    const due = Storage.getDueForReview(typeFilter || null);
    const intersect = wrongIds.filter(id => due.includes(id));
    const sd = Storage.getSpacedData();
    return this.shuffle(intersect)
      .sort((a, b) => (sd[b]?.weight || 0) - (sd[a]?.weight || 0))
      .slice(0, intensity * 3);
  }
};
