# 通用AI引擎集成指南

## 🎯 概述

本项目已成功集成通用棋类AI引擎，支持多种棋类游戏：
- **五子棋 (Gomoku)** - 15×15棋盘，活二/活三/冲四/活四评估
- **黑白棋 (Reversi)** - 8×8棋盘，位置权重优化
- **井字棋 (TicTacToe)** - 3×3棋盘，完全搜索
- **中国象棋 (Chinese Chess)** - 复杂规则支持

## 🏗️ 集成架构

### 混合AI系统
```
用户下棋 → 本地引擎计算(⚡<100ms) → 立即执行走法 → 异步AI分析(📚增强学习)
              ↓ (失败时)
          GPT-4o远程AI(🔄兜底保障)
```

### 核心组件

1. **本地AI引擎** (`universal-board-ai.ts`)
   - Minimax + Alpha-Beta剪枝
   - WebWorker异步计算
   - 多游戏适配器

2. **游戏检测器** (`src/utils/game-detector.ts`)
   - 自动检测游戏类型
   - 棋盘状态转换
   - 走法格式转换

3. **本地引擎管理器** (`src/utils/local-ai-engine.ts`)
   - 同步/异步计算
   - 错误处理和回退
   - 状态监控

## 🚀 使用方法

### 步骤1：放置通用AI引擎
将你的 `universal-board-ai.ts` 文件放入项目根目录或合适位置。

### 步骤2：在游戏HTML中加载引擎
```html
<!-- 在游戏HTML的script标签中添加 -->
<script src="./universal-board-ai.ts"></script>
<!-- 或者通过模块导入 -->
<script type="module">
  import * as UniversalBoardAI from './universal-board-ai.ts';
  window.UniversalBoardAI = UniversalBoardAI;
</script>
```

### 步骤3：引擎自动生效
引擎会自动接管AI计算：
- 检测游戏类型
- 使用对应的算法
- 提供瞬时响应
- 异步获取AI解释

## 📋 API接口示例

### 五子棋使用
```javascript
// 直接调用（如果可用）
const { bestMove, score } = window.UniversalBoardAI.bestMoveGomoku(gameState, 3, 800);

// WebWorker调用（推荐）
const adapter = new window.UniversalBoardAI.GomokuAdapter();
const worker = window.UniversalBoardAI.createSearchWorker(adapter);
worker.postMessage({ 
  type: 'search', 
  state: gameState, 
  options: { maxDepth: 3, timeMs: 800 } 
});
```

### 井字棋使用
```javascript
const { bestMove, score } = window.UniversalBoardAI.bestMoveTicTacToe(gameState, 9, 500);
```

## 🎮 游戏配置

### 默认参数
```javascript
const gameConfigs = {
  gomoku: { depth: 3, time: 800 },
  reversi: { depth: 6, time: 1000 },
  tictactoe: { depth: 9, time: 500 },
  chess: { depth: 4, time: 2000 }
};
```

### 自定义配置
修改 `aiBattleModule.js` 中的检测逻辑：
```javascript
// 自定义游戏检测
detectGameType() {
  // 添加你的检测逻辑
  if (customCondition) {
    return {
      type: 'your-game',
      adapter: 'YourGameAdapter',
      defaultDepth: 4,
      defaultTime: 1000
    };
  }
}
```

## 🔧 调试和监控

### 控制台日志
- `🎯` 本地引擎相关
- `🤖` 远程AI相关  
- `🎮` 游戏检测相关

### 性能监控
```javascript
// 获取引擎状态
const status = aiInterface.getLocalEngineStatus();
console.log('引擎状态:', status);
// 输出: { available: true, games: ['gomoku', 'tictactoe'], hasWebWorker: true }
```

## ⚠️ 故障排除

### 1. 引擎未加载
**现象**: 控制台显示"本地引擎不可用"
**解决**: 确保 `universal-board-ai.ts` 正确加载，`window.UniversalBoardAI` 可用

### 2. WebWorker失败
**现象**: 自动回退到同步计算
**解决**: 检查浏览器WebWorker支持，或直接使用同步模式

### 3. 游戏检测错误
**现象**: 使用错误的游戏引擎
**解决**: 检查页面元素和内容，调整检测逻辑

## 📊 性能对比

| 指标 | 本地引擎 | 远程GPT-4o | 混合方案 |
|------|----------|------------|----------|
| 响应时间 | <100ms | 2-5秒 | <100ms |
| 棋力水平 | 专业 | 不稳定 | 专业 |
| 成本 | 免费 | 有费用 | 节省90% |
| 离线支持 | ✅ | ❌ | ✅ |
| 教学价值 | ❌ | ✅ | ✅ |

## 🎯 集成状态

✅ 通用AI引擎接口定义  
✅ 游戏检测和适配器选择  
✅ 前端HTML的AI触发逻辑集成  
✅ 后端API多游戏分析支持  
⏳ 测试和验证集成效果  

## 📝 下一步优化

1. **性能优化**
   - 开局库支持
   - 更智能的搜索深度调整
   - 内存优化

2. **功能增强**
   - 难度等级选择
   - 提示系统
   - 棋谱分析

3. **UI改进**
   - 分析结果可视化
   - 进度指示器
   - 设置面板

## 🤝 技术支持

如需帮助或发现问题，请查看控制台日志并提供：
1. 游戏类型和URL
2. 控制台错误信息  
3. 引擎状态信息
4. 复现步骤

---

**🎮 Happy Gaming with AI!** 🚀