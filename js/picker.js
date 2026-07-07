/* ============================================
   picker.js - 无重复随机抽题算法 v7.1
   从候选池中依次抽取，抽走的题目立即移除，保证不重复
   【v7.1】Picker.build 增加 filterType 参数，输出前校验题型一致性
   ============================================ */
const Picker = {
  build(sourceList, random, limit, filterType) {
    if (!sourceList || !Array.isArray(sourceList)) return [];
    let pool = [...sourceList];
    if (random) { pool = this._shuffle(pool); }
    const count = (limit && limit > 0 && limit < pool.length) ? limit : pool.length;
    const result = pool.slice(0, count);
    const validated = result.filter(q => q && typeof q.id !== 'undefined' && q.type);
    if (filterType && filterType !== 'all') {
      const before = validated.length;
      const strict = validated.filter(q => q.type === filterType);
      const removed = before - strict.length;
      if (removed > 0) {
        console.warn(
          '[Picker.build] 题型校验：过滤掉 ' + removed + ' 道不匹配题型 "' + filterType + '" 的题目（过滤前 ' + before + ' 道，过滤后 ' + strict.length + ' 道）'
        );
      }
      return strict;
    }
    return validated;
  },
  buildFromWrongIds(wrongIds, fullList, filterType, random) {
    if (!wrongIds || !fullList) return [];
    let list = wrongIds
      .map(id => fullList.find(q => q && q.id === id))
      .filter(q => {
        if (!q) return false;
        if (filterType && filterType !== 'all' && q.type !== filterType) return false;
        return true;
      });
    if (random) { list = this._shuffle(list); }
    return list;
  },
  _shuffle(arr) {
    const r = [...arr];
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }
};