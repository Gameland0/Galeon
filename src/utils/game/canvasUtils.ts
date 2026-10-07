export class CanvasUtils {
    static clear(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
      ctx.clearRect(x, y, width, height);
    }
  
    static drawSprite(ctx: CanvasRenderingContext2D, sprite: HTMLImageElement, x: number, y: number, width: number, height: number) {
      ctx.drawImage(sprite, x, y, width, height);
    }
  
    static drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string = '#000', font: string = '16px Arial') {
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.fillText(text, x, y);
    }
  
    static drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, width, height);
    }
  
    static drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.closePath();
    }
  
    static setScale(ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number) {
      ctx.scale(scaleX, scaleY);
    }
  
    static resetTransform(ctx: CanvasRenderingContext2D) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  
    static getMousePos(canvas: HTMLCanvasElement, evt: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
      };
    }
  }
  