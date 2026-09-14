export interface DouyinTouchPoint { identifier: number; clientX: number; clientY: number }
export interface DouyinTouchEvent {
  touches: DouyinTouchPoint[];
  changedTouches: DouyinTouchPoint[];
}
export interface DouyinSocketTask {
  send(options: { data: string; fail?: (error: { errMsg?: string }) => void }): void;
  close(options?: { code?: number; reason?: string }): void;
  onOpen(listener: () => void): void;
  onMessage(listener: (event: { data: string | ArrayBuffer }) => void): void;
  onClose(listener: (event: { code?: number; reason?: string }) => void): void;
  onError(listener: (error: { errMsg?: string }) => void): void;
}
export interface DouyinCanvas {
  width: number;
  height: number;
  getContext(kind: 'webgl2' | 'webgl' | 'experimental-webgl', options?: object): WebGLRenderingContext | null;
  addEventListener?: (name: string, listener: EventListener) => void;
  removeEventListener?: (name: string, listener: EventListener) => void;
}
export interface DouyinApi {
  createCanvas(): DouyinCanvas;
  getSystemInfoSync(): { screenWidth: number; screenHeight: number; windowWidth?: number; windowHeight?: number; pixelRatio?: number; safeArea?: { top: number; left: number; right: number; bottom: number } };
  getStorageSync?(key: string): unknown;
  setStorageSync?(key: string, data: string): void;
  removeStorageSync?(key: string): void;
  vibrateShort?(options?: { fail?: (error: { errMsg?: string }) => void }): void;
  login?(options: { force: false; success: (result: { isLogin: boolean; code?: string; anonymousCode?: string }) => void; fail: (error: { errMsg?: string }) => void }): void;
  onTouchStart(listener: (event: DouyinTouchEvent) => void): void;
  onTouchMove(listener: (event: DouyinTouchEvent) => void): void;
  onTouchEnd(listener: (event: DouyinTouchEvent) => void): void;
  onTouchCancel(listener: (event: DouyinTouchEvent) => void): void;
  onShow(listener: () => void): void;
  onHide(listener: () => void): void;
  connectSocket(options: { url: string; fail?: (error: { errMsg?: string }) => void }): DouyinSocketTask;
}
