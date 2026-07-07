/* ============================================
   common.js - 通用工具函数 v7.0
   【v7.0 变更】
   - 答案判定统一使用 Storage.checkCorrect / checkCorrectMulti
   - 删除 drawTrendChart（v6.0 已移除）
   - 新增 normalizeAnswer 统一预处理空格/大小写
   - 选项双向映射保留（v5.0）
   【v6.0 变更】
   - 彻底删除 drawTrendChart()
   ============================================ */
const App = {
  /**
   * 规范化答案字符串：去除前后空格、全角转半角、统一大写
   * @param {string} s
   * @returns {string}
   */
  normalizeAnswer(s) {
    if (typeof s !== 'string') return '';
    // 全角字母转半角，全角逗号转半角
    return s.replace(/[\uFF21-\uFF3A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
            .replace(/[\uFF0C\u3001]/g, ',')
            .trim()
            .toUpperCase();
  },
  /** 按题型筛选（带安全校验） */
  filterQuestions(type, sourceList) {
    const list = sourceList || (typeof questionList !== 'undefined' ? questionList : []);
    if (!Array.isArray(list)) return [];
    if (type === 'all' || !type) return [...list];
    return list.filter(q => q && q.type === type);
  },
  /** Fisher-Yates 洗牌 */
  shuffle(arr) {
    if (!Array.isArray(arr)) return [];
    const r = [...arr];
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  },
  getTypeName(t) {
    if (typeof I18N !== 'undefined' && I18N.typeName) return I18N.typeName(t);
    const fb = { radio:'单选题', checkbox:'多选题', fill:'填空题', judge:'判断题', all:'全部' };
    return fb[t] || t;
  },
  getTypeIcon(t) {
    const m = { radio:'🔘', checkbox:'☑️', fill:'✍️', judge:'⚖️', all:'📋' };
    return m[t] || '❓';
  },
  /** 原始参考答案格式化（无映射） */
  formatAnswer(q) {
    if (!q) return '';
    const a = q.answer || '';
    try {
      switch (q.type) {
        case 'radio': return a + '. ' + ((Array.isArray(q.options) ? q.options[a.charCodeAt(0)-65] : a) || a);
        case 'judge': return a === 'A' ? `${I18N.t('judgeRight')}（A）` : `${I18N.t('judgeWrong')}（B）`;
        case 'checkbox':
          return a.split(',').map(l => {
            const t = l.trim();
            return t + '. ' + (Array.isArray(q.options) ? (q.options[t.charCodeAt(0)-65] || t) : t);
          }).join('；');
        case 'fill': return a.replace(/、/g, '；');
      }
    } catch (e) { /* 容错 */ }
    return a;
  },
  /**
   * v5.0 双向映射参考答案展示
   */
  formatAnswerMapped(q, shuffled) {
    if (!q) return '';
    if (!shuffled) return this.formatAnswer(q);
    const a = q.answer || '';
    const mapping = shuffled.mapping || {};
    try {
      switch (q.type) {
        case 'radio': {
          const dl = mapping[a] || a;
          return dl + '. ' + (Array.isArray(q.options) ? (q.options[a.charCodeAt(0)-65] || a) : a);
        }
        case 'judge': return a === 'A' ? `${I18N.t('judgeRight')}（A）` : `${I18N.t('judgeWrong')}（B）`;
        case 'checkbox':
          return a.split(',').map(l => {
            const t = l.trim().toUpperCase();
            const dl = mapping[t] || t;
            return dl + '. ' + (Array.isArray(q.options) ? (q.options[t.charCodeAt(0)-65] || t) : t);
          }).join('；');
        case 'fill': return a.replace(/、/g, '；');
      }
    } catch (e) { /* 容错 */ }
    return a;
  },
  /**
   * v5.0 双向映射用户答案展示
   */
  formatUserAnsMapped(userAns, q, shuffled) {
    if (!userAns || !q || !shuffled) return userAns;
    const mapping = shuffled.mapping || {};
    try {
      if (q.type === 'radio') {
        const dl = mapping[userAns] || userAns;
        const idx = userAns.charCodeAt(0) - 65;
        return dl + '. ' + (Array.isArray(q.options) ? (q.options[idx] || userAns) : userAns);
      }
      if (q.type === 'checkbox') {
        return userAns.split(',').map(l => {
          const t = l.trim().toUpperCase();
          const dl = mapping[t] || t;
          const idx = t.charCodeAt(0) - 65;
          return dl + '. ' + (Array.isArray(q.options) ? (q.options[idx] || t) : t);
        }).join('；');
      }
    } catch (e) { /* 容错 */ }
    return userAns;
  },
  setImageSrc(imgEl, src) {
    if (!imgEl) return;
    if (!src) {
      imgEl.style.display = 'none';
      imgEl.src = '';
      return;
    }
    imgEl.onerror = function() {
      this.style.display = 'block';
      this.style.background = '#f0ebe3';
      this.style.minHeight = '60px';
      this.alt = '🖼 ' + I18N.t('imgLoadFail') + '：' + src;
      this.src = '';
    };
    imgEl.onload = function() {
      this.style.display = 'block';
      this.style.background = '';
      this.style.minHeight = '';
    };
    imgEl.src = src;
  },
  /** v7.0 选项随机打乱 */
  shuffleOptionsIfEnabled(q) {
    const pref = (typeof Storage !== 'undefined' && Storage.getPref) ? Storage.getPref() : {};
    if (!pref.randomOptions || !q || q.type === 'fill' || q.type === 'judge' || !Array.isArray(q.options) || q.options.length === 0) {
      const labels = ['A','B','C','D','E','F'].slice(0, (q && Array.isArray(q.options)) ? q.options.length : 0);
      const mapping = {};
      labels.forEach(l => mapping[l] = l);
      return { options: [...(q ? (q.options||[]) : [])], labels, mapping, reverseMapping: { ...mapping } };
    }
    const indices = q.options.map((_, i) => i);
    const shuffled = this.shuffle(indices);
    const labels = ['A','B','C','D','E','F'];
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
  restoreOriginalAnswer(userNewAns, reverseMapping) {
    if (!userNewAns || !reverseMapping) return userNewAns;
    return userNewAns.split(',').map(s => {
      const t = s.trim().toUpperCase();
      return reverseMapping[t] || t;
    }).join(',');
  },
  /** 环形得分图 */
  drawScoreRing(canvas, score, total) {
    if (!canvas) return;
    try {
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
      ctx.fillStyle = '#333';
      ctx.font = 'bold 1.6rem sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((pct * 100).toFixed(1) + '%', cx, cy);
    } catch (e) { console.warn('[drawScoreRing] error:', e.message); }
  },
  /** v7.0 错题权重 */
  getWrongWeight(id) {
    const detail = Storage.getWrongDetail();
    const d = detail[id] || { wrongCount: 0, wrongRate: 0 };
    return {
      wrongCount: d.wrongCount || 0,
      wrongRate: d.wrongRate || 0,
      score: (d.wrongCount || 0) * 10 + (d.wrongRate || 0) * 100
    };
  },
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