/* ============================================
   state.js - 命名空间状态管理 v7.0
   将所有刷题状态集中管理，每次进入页面创建独立实例
   采用闭包隔离，多次进入互不干扰
   ============================================ */
const QuizState = (function() {
  'use strict';
  /**
   * 创建新的刷题会话状态实例
   * 每次调用返回全新独立的状态对象，避免多实例污染
   */
  function createSession() {
    return {
      /** 当前题目索引 */
      qIndex: 0,
      /** 当前筛选题型 */
      filterType: 'all',
      /** 是否随机模式 */
      randomMode: false,
      /** 当前模式：normal|review|exam|wrong */
      currentMode: 'normal',
      /** 是否显示答案面板 */
      showAnswer: false,
      /** 考试是否已结束 */
      examFinished: false,
      /** 考试开始时间戳 */
      examStartTime: 0,
      /** 考试模式临时作答 { qid: answer } */
      examUserAnswers: {},
      /** 自动跳转定时器ID */
      autoJumpTimer: null,
      /** 本轮已答统计 */
      sessionStats: { done: 0, correct: 0, wrong: 0 },
      /** 选项打乱缓存 Map<qid, shuffledObj> */
      shuffledCache: new Map(),
      /** 当前题选项映射 */
      currentOptMapping: null,
      /** 防重复报告跳转 */
      reportedForSession: false,
      /**
       * 重置整个会话到初始状态
       */
      reset() {
        this.qIndex = 0;
        this.showAnswer = false;
        this.examFinished = false;
        this.examStartTime = 0;
        this.examUserAnswers = {};
        this.autoJumpTimer = null;
        this.sessionStats = { done: 0, correct: 0, wrong: 0 };
        this.shuffledCache = new Map();
        this.currentOptMapping = null;
        this.reportedForSession = false;
      },
      /**
       * 清空自动跳转定时器
       */
      clearAutoJump() {
        if (this.autoJumpTimer) {
          clearTimeout(this.autoJumpTimer);
          this.autoJumpTimer = null;
        }
      },
      /**
       * 获取当前题目
       * @param {Array} qList 当前题目列表
       * @returns {Object|null}
       */
      getCurrentQ(qList) {
        if (!qList || qList.length === 0) return null;
        if (this.qIndex < 0 || this.qIndex >= qList.length) return null;
        return qList[this.qIndex];
      },
      /**
       * 安全移动到下一题
       * @param {Array} qList 当前题目列表
       * @returns {boolean} 是否成功移动
       */
      moveNext(qList) {
        if (!qList || qList.length === 0) return false;
        if (this.qIndex < qList.length - 1) {
          this.qIndex++;
          return true;
        }
        return false;
      },
      /**
       * 安全移动到上一题
       * @returns {boolean}
       */
      movePrev() {
        if (this.qIndex > 0) {
          this.qIndex--;
          return true;
        }
        return false;
      },
      /**
       * 安全跳转到指定索引
       * @param {number} idx
       * @param {Array} qList
       * @returns {boolean}
       */
      jumpTo(idx, qList) {
        if (!qList || qList.length === 0) return false;
        if (idx >= 0 && idx < qList.length) {
          this.qIndex = idx;
          return true;
        }
        return false;
      },
      /**
       * 检查是否是最后一题
       * @param {Array} qList
       * @returns {boolean}
       */
      isLastQ(qList) {
        return qList && qList.length > 0 && this.qIndex >= qList.length - 1;
      },
      /**
       * 获取打乱结果（优先缓存）
       * @param {Object} q 题目对象
       * @returns {Object} shuffled对象
       */
      getShuffledForQ(q) {
        if (!q) return null;
        if (this.shuffledCache.has(q.id)) {
          return this.shuffledCache.get(q.id);
        }
        const shuffled = App.shuffleOptionsIfEnabled(q);
        this.shuffledCache.set(q.id, shuffled);
        return shuffled;
      }
    };
  }
  // 单例：当前活跃会话
  let _activeSession = createSession();
  return {
    /** 获取当前活跃会话（单例） */
    get session() { return _activeSession; },
    /** 刷新会话（新建实例） */
    newSession() { _activeSession = createSession(); return _activeSession; },
    /** 获取当前会话的快照副本 */
    snapshot() { return JSON.parse(JSON.stringify(_activeSession)); }
  };
})();