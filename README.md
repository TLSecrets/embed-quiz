# 📚 嵌入式应用开发 · 刷题系统
> 2025-2026学年第2学期 · 167道客观题 · 纯前端离线运行
![Pages](https://img.shields.io/badge/GitHub_Pages-就绪-success?logo=github)
![License](https://img.shields.io/badge/license-MIT-blue)
![JS](https://img.shields.io/badge/Vanilla_JS-ES6-yellow?logo=javascript)
一个**零依赖**、**全离线**、**开箱即用**的嵌入式应用开发客观题刷题系统，专为备考复习设计。
---
## ✨ 核心特性
| 特性 | 说明 |
|------|------|
| 🎯 四大题型 | 单选(99) / 多选(11) / 填空(15) / 判断(42) |
| 🔀 四种模式 | 常规刷题 / 背题浏览 / 模拟考试 / 错题训练 |
| 📊 统计仪表盘 | 累计做题量、正确率趋势图、各题型进度 |
| 📕 智能错题本 | 双策略训练：频次优先 + 艾宾浩斯间隔重复 |
| 🏷️ 标签+收藏 | 内置3类标签，支持自定义，辅助分类管理 |
| 📝 个人笔记 | 每道题可绑定笔记，解析下方永久保存 |
| 🌓 深色模式 | 一键切换，全站同步，夜间护眼 |
| ⌨️ 快捷键 | 1/2/3/4选ABCD，←→翻题，Enter下一题 |
| 📈 完成报告 | 环形得分图 + 完整统计 + 错题汇总 |
| 💾 自动保存 | 中途退出自动恢复进度，作答实时持久化 |
| 📱 响应式 | 自适应PC/平板/手机，触摸友好 |
| 🔒 隐私安全 | 100%本地存储，无任何网络请求 |
---
## 🚀 快速上手
### 本地运行
```bash
# 方式一：直接双击
双击 index.html
# 方式二：本地服务器（推荐，避免file://跨域限制）
python -m http.server 8080
# 访问 http://localhost:8080
```
### GitHub Pages 上线
```bash
# 1. GitHub 新建仓库（README不勾选）
# 2. 推送代码
git init && git add . && git commit -m "init"
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main && git push -u origin main
# 3. Settings → Pages → Source: main → /(root) → Save
# 4. 访问 https://你的用户名.github.io/仓库名/
```
---
## 📁 项目结构
```
embed-quiz/
├── index.html          # 首页仪表盘 + 统计 + 设置
├── exam.html           # 核心刷题页（4种模式）
├── wrong.html          # 错题本多维管理 + 智能训练
├── report.html         # 练习完成报告页
├── README.md           # 仓库说明（本文件）
├── css/
│   └── style.css       # 浅色+深色双主题样式
├── js/
│   ├── question.js     # 167道题完整JSON题库
│   ├── storage.js      # localStorage持久化封装
│   ├── common.js       # 渲染/图表/抽题/排序/间隔重复
│   ├── hotkey.js       # 键盘快捷键监听
│   └── darkmode.js     # 深色模式切换逻辑
└── images/             # 题目配图（.png）
```
---
## 🎮 功能详解
### 四种刷题模式
| 模式 | 说明 |
|------|------|
| **常规刷题** | 选完立刻判定对错，显示解析，可做笔记标签 |
| **背题浏览** | 直接展示题目+答案，快速过知识点 |
| **模拟考试** | 关闭即时反馈，全部完成统一出分+报告 |
| **错题训练** | 只刷历史错题，两种智能策略自由组合 |
### 错题智能训练策略
1. **错误频次优先**：优先抽取错误次数多/错误率高的顽固错题
2. **艾宾浩斯间隔重复**：做错题目自动加入复习队列，科学间隔复习
   - 可调节复习强度（1-10）
   - 可切换优先级：本次错题优先 / 全部历史错题优先
### 键盘快捷键
| 快捷键 | 功能 |
|--------|------|
| `1` `2` `3` `4` | 快速选择 A / B / C / D |
| `←` `→` | 上一题 / 下一题 |
| `Enter` | 跳转下一题 |
### 数据存储说明
所有数据存储在浏览器 localStorage 中：
- `eq_a_*`：每道题作答记录
- `eq_c_*`：答题次数统计
- `eq_o_*`：各选项选择次数
- `eq_wrong_*`：错题列表与详细统计
- `eq_spaced_*`：间隔重复权重数据
- `eq_progress`：当前练习进度
- `eq_global_stats`：全局统计（含正确率历史）
- `eq_user_pref`：用户偏好设置
- `eq_tags_custom`：自定义标签库
---
## 🔧 题库维护
### 新增题目
编辑 `js/question.js`，在 `questionList` 数组末尾追加：
```javascript
{
  id: 168,                     // 唯一递增题号
  type: 'radio',               // radio/checkbox/fill/judge
  title: '完整题干文本',
  img: 'images/xxx.png',       // 无图片填 ""
  options: ['选项A', '选项B', '选项C', '选项D'],
  answer: 'A',                 // 多选逗号分隔，填空顿号分隔，判断A=对B=错
  tags: [],
  collect: false,
  note: ''
}
```
### 替换图片
1. 将图片放入 `images/` 目录
2. 修改对应题目的 `img` 字段：`"images/你的文件名.png"`
3. 图片建议宽度 ≤ 800px，格式PNG/JPG
---
## ❓ 常见问题
**Q: 换浏览器后数据还在吗？**  
A: 不在。数据绑定浏览器本地存储，不同浏览器不互通。
**Q: 清除浏览器缓存会丢失数据吗？**  
A: 会。建议定期通过首页"全局设置"手动导出复习进度备忘。
**Q: 填空题怎么判对？**  
A: 模糊匹配，包含参考答案关键词即判对。多空用顿号或逗号分隔。
**Q: 判断题的A/B对应什么？**  
A: A = 对（正确），B = 错（错误）。
---
## 📄 License
MIT — 仅供学习使用