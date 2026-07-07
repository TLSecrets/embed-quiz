/* ============================================
   renderer.js - 单题DOM渲染器 v7.0
   - 按需懒加载：仅渲染当前题目DOM，不批量创建全部题目
   - 局部更新：答题后只更新当前题区块，不重绘整个列表
   - 所有DOM操作限定在容器内，不污染全局
   ============================================ */
const Renderer = {
  /**
   * 获取I18N安全文本的快捷方法
   */
  _t(key) { try { return I18N.t(key); } catch(e) { return key; } },
  /**
   * 渲染答题区域（单选/多选/填空/判断）
   * @param {HTMLElement} area 容器元素
   * @param {Object} q 题目对象
   * @param {Object} shuffled 打乱结果
   * @param {string} userAns 用户答案（原始标签）
   * @param {string} currentMode 当前模式
   */
  renderAnswerArea(area, q, shuffled, userAns, currentMode) {
    if (!area || !q) return;
    const mapping = shuffled.mapping || {};
    area.innerHTML = '';
    try {
      switch (q.type) {
        case 'radio': {
          const mappedAns = mapping[userAns] || userAns;
          const ul = document.createElement('ul');
          ul.className = 'eq-options-list';
          shuffled.options.forEach((opt, i) => {
            const label = shuffled.labels[i];
            const li = document.createElement('li');
            li.className = 'eq-opt-item' + (mappedAns === label ? ' eq-selected' : '');
            li.setAttribute('data-opt', label);
            li.innerHTML = `<span class="eq-opt-letter">${label}</span><span class="eq-opt-text">${this._escHtml(opt)}</span>`;
            li.addEventListener('click', function() {
              document.querySelectorAll('.eq-opt-item').forEach(e => e.classList.remove('eq-selected'));
              li.classList.add('eq-selected');
              if (typeof window.selOpt === 'function') window.selOpt(li, label);
            });
            ul.appendChild(li);
          });
          area.appendChild(ul);
          break;
        }
        case 'checkbox': {
          const rawSet = new Set(userAns.split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
          const newLabelSet = new Set();
          rawSet.forEach(orig => { if (mapping[orig]) newLabelSet.add(mapping[orig]); });
          const ul = document.createElement('ul');
          ul.className = 'eq-options-list';
          shuffled.options.forEach((opt, i) => {
            const label = shuffled.labels[i];
            const li = document.createElement('li');
            li.className = 'eq-opt-item' + (newLabelSet.has(label) ? ' eq-selected' : '');
            li.setAttribute('data-opt', label);
            li.innerHTML = `<span class="eq-opt-letter">${label}</span><span class="eq-opt-text">${this._escHtml(opt)}</span>`;
            li.addEventListener('click', function() {
              li.classList.toggle('eq-selected');
              const sels = [];
              document.querySelectorAll('.eq-opt-item.eq-selected').forEach(e => sels.push(e.getAttribute('data-opt')));
              if (typeof window.selChk === 'function') window.selChk(li, label);
            });
            ul.appendChild(li);
          });
          area.appendChild(ul);
          break;
        }
        case 'fill': {
          const div = document.createElement('div');
          div.className = 'eq-fill-area';
          const ta = document.createElement('textarea');
          ta.id = 'fillInput';
          ta.placeholder = this._t('fillPlaceholder');
          ta.value = userAns || '';
          ta.addEventListener('blur', function() {
            if (typeof window.saveFill === 'function') window.saveFill();
          });
          const hint = document.createElement('div');
          hint.className = 'eq-fill-hint';
          hint.textContent = this._t('fillHint');
          div.appendChild(ta);
          div.appendChild(hint);
          area.appendChild(div);
          break;
        }
        case 'judge': {
          const div = document.createElement('div');
          div.className = 'eq-judge-actions';
          const btnRight = document.createElement('button');
          btnRight.className = 'eq-judge-btn' + (userAns === 'A' ? ' eq-sel-right' : '');
          btnRight.textContent = '✅ ' + this._t('judgeRight');
          btnRight.addEventListener('click', function() {
            if (typeof window.selJudge === 'function') window.selJudge('A');
          });
          const btnWrong = document.createElement('button');
          btnWrong.className = 'eq-judge-btn' + (userAns === 'B' ? ' eq-sel-wrong' : '');
          btnWrong.textContent = '❌ ' + this._t('judgeWrong');
          btnWrong.addEventListener('click', function() {
            if (typeof window.selJudge === 'function') window.selJudge('B');
          });
          div.appendChild(btnRight);
          div.appendChild(btnWrong);
          area.appendChild(div);
          break;
        }
      }
    } catch (e) {
      console.warn('[Renderer] renderAnswerArea error:', e.message);
      area.innerHTML = '<p style="color:var(--danger);">渲染题目出错，请刷新重试</p>';
    }
  },
  /**
   * 渲染答案面板
   * @param {HTMLElement} box
   * @param {Object} q
   * @param {string} userAns
   * @param {Object} shuffled
   * @param {boolean} showAnswer
   * @param {string} currentMode
   */
  renderAnswerBox(box, q, userAns, shuffled, showAnswer, currentMode) {
    if (!box) return;
    if (!showAnswer || currentMode === 'exam') {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    if (!q) { box.innerHTML = ''; return; }
    const isCorrect = Storage.checkCorrect(q.id, userAns);
    const multi = q.type === 'checkbox' ? Storage.checkCorrectMulti(q.id, userAns) : null;
    const refDisplay = App.formatAnswerMapped(q, shuffled);
    const userDisplay = userAns ? App.formatUserAnsMapped(userAns, q, shuffled) : '';
    let statusHtml = '';
    if (userAns) {
      if (q.type === 'checkbox' && multi) {
        if (multi.isExactlyCorrect) {
          statusHtml = '<span style="color:var(--success);">✅ ' + this._t('ansCorrect') + '</span>';
        } else if (multi.isPartialCorrect) {
          statusHtml = '<span style="color:var(--warn);">⚠️ 部分正确（有漏选）</span>';
        } else {
          statusHtml = '<span style="color:var(--danger);">❌ ' + this._t('ansWrong') + '</span>';
        }
      } else {
        statusHtml = isCorrect
          ? '<span style="color:var(--success);">✅ ' + this._t('ansCorrect') + '</span>'
          : '<span style="color:var(--danger);">❌ ' + this._t('ansWrong') + '</span>';
      }
    } else {
      statusHtml = '<span style="color:var(--text2);">⚠️ ' + this._t('noAnswer') + '</span>';
    }
    box.innerHTML = `
      <div><span class="eq-ref">📌 ${this._t('correctAns')}：</span>${refDisplay}</div>
      <div style="margin-top:6px;">${userDisplay ? '<span class="eq-user">' + this._t('yourAns') + '：' + userDisplay + '</span>' : '<span style="color:var(--text2);">' + this._t('notAnswered') + '</span>'}</div>
      <div style="margin-top:4px;font-weight:600;">${statusHtml}</div>`;
  },
  /**
   * 渲染答题卡缩略图
   * @param {HTMLElement} grid
   * @param {Array} qList
   * @param {number} qIndex
   * @param {string} currentMode
   * @param {Object} examUserAnswers
   */
  renderSheet(grid, qList, qIndex, currentMode, examUserAnswers) {
    if (!grid) return;
    if (qList.length > 100) { grid.style.display = 'none'; return; }
    grid.style.display = 'flex';
    grid.innerHTML = '';
    try {
      qList.forEach((q, i) => {
        const div = document.createElement('div');
        let cls = 'eq-sheet-item';
        const a = currentMode === 'exam'
          ? (examUserAnswers && examUserAnswers[q.id] ? examUserAnswers[q.id] : '')
          : (Storage.getAnswer(q.id) || '');
        if (a) {
          cls += Storage.checkCorrect(q.id, a) ? ' eq-done-correct' : ' eq-done-wrong';
        }
        if (i === qIndex) cls += ' eq-current';
        div.className = cls;
        div.textContent = i + 1;
        div.addEventListener('click', function() {
          if (typeof window.jumpTo === 'function') window.jumpTo(i);
        });
        grid.appendChild(div);
      });
    } catch (e) { console.warn('[Renderer] renderSheet error:', e.message); }
  },
  /**
   * 渲染笔记和标签区域
   * @param {HTMLElement} area
   * @param {Object} q
   * @param {string} currentMode
   */
  renderNoteTag(area, q, currentMode) {
    if (!area || !q) return;
    if (currentMode === 'exam') { area.style.display = 'none'; return; }
    area.style.display = 'block';
    const meta = Storage.getQuestionData(q.id);
    const tags = Storage.getTags();
    let html = `<div class="eq-note-area">
      <textarea id="noteInput" placeholder="${this._t('notePlaceholder')}" onblur="if(typeof saveNote==='function')saveNote()">${this._escHtml(meta.note || '')}</textarea>
    </div>
    <div class="eq-tag-area" id="tagArea">
      <span style="font-size:.72rem;color:var(--text2);">🏷️ ${this._t('tagsLabel')}：</span>`;
    tags.forEach(tag => {
      const active = meta.tags && meta.tags.includes(tag);
      html += `<span class="eq-tag${active ? ' eq-tag-active' : ''}" onclick="if(typeof toggleTag==='function')toggleTag('${this._escHtml(tag)}')">${this._escHtml(tag)}</span>`;
    });
    html += `<span class="eq-tag eq-tag-add" onclick="if(typeof addCustomTag==='function')addCustomTag()">${this._t('addTag')}</span>
      <span class="eq-tag${meta.collect ? ' eq-tag-star' : ''}" onclick="if(typeof toggleCollect==='function')toggleCollect()" style="margin-left:8px;cursor:pointer;">${meta.collect ? '⭐ ' + this._t('collected') : '☆ ' + this._t('collect')}</span>
    </div>`;
    area.innerHTML = html;
  },
  /** HTML转义 */
  _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
};