export class GameCodeUtils {
    static createGameInstance(code: string, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
      try {
        // 添加安全包装器
        const wrappedCode = `
          (function(canvas, context) {
            "use strict";
            const game = (function() {
              ${code}
              return new Game(canvas, context);
            })();
            return {
              init: () => game.init?.(),
              update: (deltaTime) => game.update?.(deltaTime),
              render: () => game.render?.(),
              handleInput: (input) => game.handleInput?.(input),
              getState: () => game.getState?.(),
              setState: (state) => game.setState?.(state),
            };
          })
        `;
  
        // 创建游戏实例
        const gameConstructor = new Function('canvas', 'context', `return ${wrappedCode}`);
        return gameConstructor(canvas, context);
      } catch (error) {
        console.error('Error creating game instance:', error);
        return null;
      }
    }
  
    static validateGameCode(code: string): boolean {
      const requiredMethods = ['init', 'update', 'render', 'gameLoop', 'onKeyDown', 'onTouch', 'onGameOver'];
      return requiredMethods.every(method => 
        code.includes(`function ${method}`) || 
        code.includes(`${method}:`)
      );
    }
  
    static injectGameDependencies(code: string): string {
      const dependencies = `
        const { CanvasUtils } = window.gameUtils;
        const { GameStateUtils } = window.gameUtils;
      `;
      return dependencies + code;
    }

    // 确保游戏代码中包含结束游戏的通知代码
    static ensureGameEndNotification(code: string): string {
      // 检查是否已经有 endGame 方法
      if (code.includes('function endGame') || code.includes('endGame:')) {
        // 检查 endGame 方法中是否包含 postMessage 代码
        if (!code.includes('window.parent.postMessage') || !code.includes('GAME_END')) {
          // 如果没有通知代码，则注入到 endGame 方法中
          return code.replace(
            /(function\s+endGame.*?\{|endGame\s*:\s*function.*?\{)/,
            '$1\nwindow.parent.postMessage({ type: \'GAME_END\', score: Number.parseInt(this.score) || 0 },\'*\');\n'
          );
        }
      } else {
        // 如果没有 endGame 方法，添加一个
        const endGameMethod = `
        function endGame() {
          window.parent.postMessage({ type: 'GAME_END', score: Number.parseInt(this.score) || 0 },'*');
          // 游戏结束逻辑
          this.gameOver = true;
        }
        `;
        // 将方法添加到 Game 类或对象中
        return code.replace(
          /(class\s+Game\s*\{|var\s+Game\s*=\s*function|const\s+Game\s*=\s*function)/,
          `$1\n${endGameMethod}\n`
        );
      }
      return code;
    }

    // Inject skeleton implementations for any missing foundational game methods
    static injectMissingMethods(code: string): string {
      let augmented = code;
      const methods = [
        { name: 'gameLoop',   body: `function gameLoop(deltaTime) {\n  // TODO: implement game loop logic\n}` },
        { name: 'onKeyDown',  body: `function onKeyDown(event) {\n  // TODO: handle key down event\n}` },
        { name: 'onTouch',    body: `function onTouch(event) {\n  // TODO: handle touch event\n}` },
        { name: 'onGameOver', body: `function onGameOver() {\n  // TODO: game over logic\n}` },
      ];
      methods.forEach(m => {
        if (!augmented.includes(`function ${m.name}`) && !augmented.includes(`${m.name}:`)) {
          augmented = augmented.replace(
            /(class\s+Game\s*\{)/,
            `$1\n${m.body}\n`
          );
        }
      });
      return augmented;
    }

    // 处理接收到的游戏代码
    static processGameCode(code: string): string {
      // 补全缺失的方法骨架
      let processedCode = this.injectMissingMethods(code);
      // 验证代码结构完整性
      if (!this.validateGameCode(processedCode)) {
        throw new Error('Invalid game code: missing required methods');
      }
      // 注入依赖
      processedCode = this.injectGameDependencies(processedCode);
      // 确保有结束游戏通知
      processedCode = this.ensureGameEndNotification(processedCode);
      return processedCode;
    }
  
    static createErrorGameInstance(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
      return {
        init: () => {
          context.fillStyle = 'red';
          context.font = '20px Arial';
          context.fillText('Failed to load game', 10, 50);
        },
        update: () => {},
        render: () => {},
        handleInput: () => {},
        getState: () => ({ error: true }),
        setState: () => {}
      };
    }
  }
  