/* ============================================
   app.js - 全局钩子系统 v7.0
   【v7.0 变更】
   - onQuestionChange 改为 qIndex（无重复随机抽题）
   - 移除间隔重复相关钩子
   - v5.0 序号钩子保留（含映射信息），支持选项打乱
   ============================================ */
/**
 * 全局钩子方法（由页面 script 填充）
 * 每个钩子均被 try-catch 包裹，保证不入中断链
 *
 * 调用时机说明：
 *   onQuestionChange(qIndex, total, q, shuffled, currentMode)
 *     - 当用户切换到第 qIndex 题时触发
 *     - page.js 负责在切换题目后调用
 *
 *   onAnswer(qIndex, correct, totalCorrect, totalDone, isTimeout)
 *     - 当用户提交答案后触发
 *     - common.js submitAnswer 流程结束后调用
 *
 *   onSessionComplete(results)         - 答题会话完成时触发
 *   onModeChange(newMode)              - 模式切换时触发
 *   onLangChange(lang)                 - 语言切换时触发
 */
window._appHooks = {
  // 固定钩子：仅在 app.js 定义，页面侧负责调用
  onQuestionChange: function(qIndex, total, q, shuffled, currentMode) {},
  onAnswer: function(qIndex, correct, totalCorrect, totalDone, isTimeout) {},
  onSessionComplete: function(results) {},
  onModeChange: function(newMode) {},
  onLangChange: function(lang) {},
  // v5.0 序号钩子（含映射信息）
  onSequenceChange: function(seqs) {}
};
/* 注册安全调用代理 */
['onQuestionChange','onAnswer','onSessionComplete','onModeChange','onLangChange','onSequenceChange'].forEach(k => {
  const orig = window._appHooks[k];
  window._appHooks[k] = function(...args) {
    try { return orig.apply(this, args); } catch(e) { console.warn('[hook:' + k + ']', e.message); }
  };
});