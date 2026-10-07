# 🧹 清除提示状态

## 问题
如果你在测试时点击了关闭按钮（×），提示会被隐藏，因为状态保存在 localStorage 中。

## 解决方法

### 方法 1：在浏览器控制台清除（推荐）

打开浏览器，按 **F12** 打开开发者工具，在 **Console** 中执行：

```javascript
// 清除 Credit 提示状态
localStorage.removeItem('creditTipClosed');

// 清除 Game Mode 提示状态
localStorage.removeItem('gameModeTipClosed');

// 刷新页面
location.reload();
```

### 方法 2：清除所有 localStorage

```javascript
localStorage.clear();
location.reload();
```

### 方法 3：查看当前状态

```javascript
console.log('Credit Tip Closed:', localStorage.getItem('creditTipClosed'));
console.log('Game Mode Tip Closed:', localStorage.getItem('gameModeTipClosed'));
```

---

## 🔍 调试信息

代码中已添加调试日志，打开浏览器控制台可以看到：

```
🔍 Credit Tip Debug: {
  creditTipClosed: "true",      // 是否已关闭
  isLowBalance: false,          // 是否余额不足
  totalCredits: 50,             // 总余额
  willShow: false               // 是否将显示
}
```

---

## ✅ 测试步骤

1. **打开浏览器控制台** (F12)
2. **清除状态**：
   ```javascript
   localStorage.removeItem('creditTipClosed');
   localStorage.removeItem('gameModeTipClosed');
   location.reload();
   ```
3. **检查页面**：
   - Credit 区域应显示 `💡 Buy ×` 徽章
   - Game Mode 按钮右上角应显示 `🎮 Game ×` 角标

4. **测试关闭功能**：
   - 点击 `×` 关闭徽章
   - 刷新页面，确认徽章不再显示

5. **测试余额不足警告**：
   - 等待 Credits 消耗到 < 10
   - 或手动设置：`localStorage.removeItem('creditTipClosed'); location.reload();`
   - 应显示橙色的 `⚠️ Low ×` 徽章

---

## 🎯 预期效果

### 正常状态（余额 ≥ 10）
```
[Credits: 50  💡 Buy ×]  [🎮]🎮 Game ×
```

### 余额不足（余额 < 10）
```
[Credits: 5  ⚠️ Low ×]  [🎮]🎮 Game ×
```

### 关闭后
```
[Credits: 50]  [🎮]
```

---

## 💡 提示

- 徽章只在**用户未关闭过**时显示
- **余额不足时**，即使用户之前关闭过，徽章也会重新显示（橙色警告）
- 徽章是**内联显示**，不会超出窗口范围
- 点击 `×` 可以关闭徽章
