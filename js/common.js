/* ============================================
   common.js - 通用工具函数
   渲染、图表、抽题、排序、间隔重复算法、答案比对
   ============================================ */
const App = {
  filterQuestions(type) {
    if (type === 'all' || !type) return [...questionList];
    return questionList.filter(q => q.type === type);
  },
  shuffle(arr) { const r = [...arr]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; },
  getTypeName(t) { const m = { radio: '单选题', checkbox: '多选题', fill: '填空题', judge: '判断题', all: '全部' }; return m[t] || t; },
  getTypeIcon(t) { const m = { radio: '🔘', checkbox: '☑️', fill: '✍️', judge: '⚖️', all: '📋' }; return m[t] || '❓'; },
  formatAnswer(q) {
    const a = q.answer;
    switch (q.type) {
      case 'radio': return a + '. ' + (q.options[a.charCodeAt(0) - 65] || a);
      case 'judge': return a === 'A' ? '对（A）' : '错（B）';
      case 'checkbox': return a.split(',').map(l => l.trim() + '. ' + (q.options[l.trim().charCodeAt(0) - 65] || l.trim())).join('；');
      case 'fill': return a.replace(/、/g, '；');
    }
    return a;
  },
  setImageSrc(imgEl, src) {
    if (!src) { imgEl.style.display = 'none'; return; }
    imgEl.onerror = function () { this.style.display = 'none'; };
    imgEl.onload = function () { this.style.display = ''; };
    imgEl.src = src;
  },
  /** 环形得分图 (Canvas) */
  drawScoreRing(canvas, score, total) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth || 140;
    const h = canvas.height = canvas.offsetHeight || 140;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 12;
    ctx.clearRect(0, 0, w, h);
    const pct = total > 0 ? score / total : 0;
    // bg
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 10;
    ctx.strokeStyle = '#e0dcd3'; ctx.stroke();
    // arc
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * pct;
    ctx.beginPath(); ctx.arc(cx, cy, r, start, end); ctx.lineWidth = 10;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, pct >= 0.6 ? '#52b788' : pct >= 0.3 ? '#e09f3e' : '#c1292e');
    grad.addColorStop(1, '#4a7c59');
    ctx.strokeStyle = grad; ctx.stroke();
    // text
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#333';
    ctx.font = 'bold 1.6rem ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((pct * 100).toFixed(1) + '%', cx, cy);
  },
  /** 趋势折线图 (Canvas) */
  drawTrendChart(canvas, data) {
    if (!canvas || !data || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth || 600;
    const h = canvas.height = canvas.offsetHeight || 180;
    const pad = { top: 16, right: 20, bottom: 28, left: 40 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;
    ctx.clearRect(0, 0, w, h);
    const vals = data.map(d => d.accuracy); 
    const maxV = 100, minV = 0;
    const textColor = getComputedStyle(document.body).getPropertyValue('--text2').trim() || '#666';
    const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#4a7c59';
    // axes
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, h - pad.bottom); ctx.lineTo(w - pad.right, h - pad.bottom); ctx.stroke();
    ctx.fillStyle = textColor; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ph / 4) * i;
      ctx.fillText((100 - i * 25) + '%', pad.left - 6, y + 3);
      ctx.beginPath(); ctx.strokeStyle = '#eee'; ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    }
    if (vals.length < 2) return;
    const stepX = pw / Math.max(vals.length - 1, 1);
    ctx.beginPath(); ctx.strokeStyle = primaryColor; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    vals.forEach((v, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + ph * (1 - v / 100);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // dots
    vals.forEach((v, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + ph * (1 - v / 100);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = primaryColor; ctx.fill();
    });
  },
  /** 获取错题排序权重 */
  getWrongWeight(id) {
    const detail = Storage.getWrongDetail();
    const sd = Storage.getSpacedData();
    const d = detail[id] || { wrongCount: 0, wrongRate: 0 };
    const s = sd[id] || { weight: 1 };
    return { wrongCount: d.wrongCount, wrongRate: d.wrongRate, spacedWeight: s.weight, score: d.wrongCount * 10 + d.wrongRate * 100 + s.weight * 5 };
  },
  /** 间隔重复取题：按复习优先级返回待复习题目 */
  getSpacedQuestions(wrongIds, intensity) {
    const due = Storage.getDueForReview();
    const intersect = wrongIds.filter(id => due.includes(id));
    const sd = Storage.getSpacedData();
    return this.shuffle(intersect).sort((a, b) => (sd[b]?.weight || 0) - (sd[a]?.weight || 0)).slice(0, intensity * 3);
  },
  /** 按错误频次排序错题 */
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
