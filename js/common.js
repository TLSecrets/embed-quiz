/* ============================================
   common.js - 通用工具函数 (v6.0 精简版)
   【v6.0 变更】
   - 彻底删除 drawTrendChart() 趋势折线图函数
   - 保留 drawScoreRing() 环形得分图（report页面使用）
   【v5.0 核心修复】
   - formatAnswerMapped / formatUserAnsMapped 双向映射
   【v4.0 变更】
   - 彻底移除全部间隔重复相关函数
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
  /** 原始参考答案格式化（不涉及映射，用于无随机选项场景） */
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
  /**
   * 【v5.0 核心修复】双向映射参考答案展示
   * 核心公式：页面字母 = mapping[原始字母]，文本 = q.options[原始索引]
   */
  formatAnswerMapped(q, shuffled) {
    if (!shuffled) return this.formatAnswer(q);
    const a = q.answer;
    const mapping = shuffled.mapping || {};
    switch (q.type) {
      case 'radio': {
        const displayLabel = mapping[a] || a;
        return displayLabel + '. ' + (q.options[a.charCodeAt(0)-65] || a);
      }
      case 'judge':
        return a === 'A' ? '对（A）' : '错（B）';
      case 'checkbox':
        return a.split(',').map(l => {
          const trimmed = l.trim().toUpperCase();
          const dl = mapping[trimmed] || trimmed;
          return dl + '. ' + (q.options[trimmed.charCodeAt(0)-65] || trimmed);
        }).join('；');
      case 'fill':
        return a.replace(/、/g, '；');
    }
    return a;
  },
  /**
   * 【v5.0 核心修复】双向映射用户答案展示
   */
  formatUserAnsMapped(userAns, q, shuffled) {
    if (!userAns || !shuffled) return userAns;
    const mapping = shuffled.mapping || {};
    if (q.type === 'radio') {
      const dl = mapping[userAns] || userAns;
      const idx = userAns.charCodeAt(0) - 65;
      return dl + '. ' + (q.options[idx] || userAns);
    }
    if (q.type === 'checkbox') {
      return userAns.split(',').map(l => {
        const trimmed = l.trim().toUpperCase();
        const dl = mapping[trimmed] || trimmed;
        const idx = trimmed.charCodeAt(0) - 65;
        return dl + '. ' + (q.options[idx] || trimmed);
      }).join('；');
    }
    return userAns;
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
  // ===================== 选项随机打乱 =====================
  shuffleOptionsIfEnabled(q) {
    const pref = (typeof Storage !== 'undefined') ? Storage.getPref() : {};
    if (!pref.randomOptions || q.type === 'fill' || q.type === 'judge' || !q.options || q.options.length === 0) {
      const labels = ['A','B','C','D'].slice(0, q.options.length);
      const mapping = {};
      labels.forEach(l => mapping[l] = l);
      return { options: [...(q.options||[])], labels, mapping, reverseMapping: { ...mapping } };
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
  restoreOriginalAnswer(userNewAns, reverseMapping) {
    if (!userNewAns || !reverseMapping) return userNewAns;
    return userNewAns.split(',').map(s => {
      const trimmed = s.trim().toUpperCase();
      return reverseMapping[trimmed] || trimmed;
    }).join(',');
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
  // ===================== 错题权重（纯错误次数+错误率，无间隔重复字段） =====================
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