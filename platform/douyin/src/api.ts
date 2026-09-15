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
  getContext(kind: '2d', options?: object): CanvasRenderingContext2D | null;
  getContext(kind: 'webgl2' | 'webgl' | 'experimental-webgl', options?: object): WebGLRenderingContext | null;
  addEventListener?: (name: string, listener: EventListener) => void;
  removeEventListener?: (name: string, listener: EventListener) => void;
}

export interface DouyinInnerAudioContext {
  src: string;
  volume?: number;
  autoplay?: boolean;
  loop?: boolean;
  obeyMuteSwitch?: boolean;
  play(): void;
  stop(): void;
  seek(position: number): void;
  destroy(): void;
  onError?(listener: (error: { errMsg?: string; errCode?: number }) => void): void;
}

export interface DouyinAdError { errCode?: number; errNo?: number; errMsg?: string }

export interface DouyinRewardedVideoAd {
  load(): Promise<void>;
  show(): Promise<void>;
  onLoad(listener: () => void): void;
  offLoad?(listener: () => void): void;
  onError(listener: (error: DouyinAdError) => void): void;
  offError?(listener: (error: DouyinAdError) => void): void;
  onClose(listener: (result: { isEnded?: boolean; count?: number }) => void): void;
  offClose?(listener: (result: { isEnded?: boolean; count?: number }) => void): void;
}

export interface DouyinInterstitialAd {
  load(): Promise<void>;
  show(): Promise<void>;
  destroy(): void;
  onLoad(listener: () => void): void;
  onError(listener: (error: DouyinAdError) => void): void;
  onClose(listener: () => void): void;
}

export interface DouyinBannerAd {
  style: { width?: number; height?: number; top?: number; left?: number };
  show(): Promise<void>;
  hide(): Promise<void> | void;
  destroy(): void;
  onLoad(listener: () => void): void;
  onError(listener: (error: DouyinAdError) => void): void;
  onResize(listener: (size: { width: number; height: number }) => void): void;
}

export interface DouyinShowOptions {
  scene?: string;
  query?: Record<string, string | number | boolean | undefined>;
  launch_from?: string;
  location?: string;
  showFrom?: number;
}

export interface DouyinLaunchOptions extends DouyinShowOptions {
  path?: string;
  refererInfo?: { appId?: string; extraData?: Record<string, unknown> };
}

export interface DouyinApi {
  createCanvas(): DouyinCanvas;
  getSystemInfoSync(): {
    screenWidth: number;
    screenHeight: number;
    windowWidth?: number;
    windowHeight?: number;
    pixelRatio?: number;
    safeArea?: { top: number; left: number; right: number; bottom: number };
  };
  getMenuButtonLayout?(): { width: number; height: number; top: number; right: number; bottom: number; left: number };
  getLaunchOptionsSync?(): DouyinLaunchOptions;
  getEnterOptionsSync?(): DouyinLaunchOptions;

  getStorageSync?(key: string): unknown;
  setStorageSync?(key: string, data: string): void;
  removeStorageSync?(key: string): void;

  vibrateShort?(options?: { fail?: (error: { errMsg?: string }) => void }): void;
  createInnerAudioContext?(): DouyinInnerAudioContext;
  login?(options: {
    force: false;
    success: (result: { isLogin: boolean; code?: string; anonymousCode?: string }) => void;
    fail: (error: { errMsg?: string }) => void;
  }): void;
  checkSession?(options: { success?: () => void; fail?: (error: { errMsg?: string }) => void }): void;
  request?(options: {
    url: string;
    method: 'GET' | 'POST';
    header?: Record<string, string>;
    data?: Record<string, unknown>;
    dataType?: 'json';
    success: (result: { statusCode: number; data: unknown }) => void;
    fail: (error: { errMsg?: string }) => void;
  }): { abort(): void } | void;

  onTouchStart(listener: (event: DouyinTouchEvent) => void): void;
  onTouchMove(listener: (event: DouyinTouchEvent) => void): void;
  onTouchEnd(listener: (event: DouyinTouchEvent) => void): void;
  onTouchCancel(listener: (event: DouyinTouchEvent) => void): void;
  onShow(listener: (options?: DouyinShowOptions) => void): void;
  onHide(listener: () => void): void;

  reportAnalytics?(event: string, data: Record<string, string | number | boolean>): void;

  connectSocket(options: { url: string; header?: Record<string, string>; fail?: (error: { errMsg?: string }) => void }): DouyinSocketTask;

  createRewardedVideoAd?(options: {
    adUnitId: string;
    multiton?: boolean;
    multitonRewardMsg?: string[];
    multitonRewardTimes?: number;
    progressTip?: boolean;
  }): DouyinRewardedVideoAd;
  createInterstitialAd?(options: { adUnitId: string }): DouyinInterstitialAd;
  createBannerAd?(options: {
    adUnitId: string;
    style?: { width?: number; top?: number; left?: number };
    adIntervals?: number;
  }): DouyinBannerAd;

  shareAppMessage?(options: {
    channel?: 'invite' | 'video' | 'picture' | 'team_up';
    title?: string;
    desc?: string;
    imageUrl?: string;
    query?: string;
    templateId?: string;
    extra?: Record<string, unknown>;
    success?: (result?: unknown) => void;
    fail?: (error: { errMsg?: string }) => void;
  }): void;

  checkScene?(options: {
    scene: 'sidebar';
    success?: (result: { isExist?: boolean }) => void;
    fail?: (error: { errMsg?: string }) => void;
    complete?: () => void;
  }): void;
  navigateToScene?(options: {
    scene: 'sidebar';
    success?: (result?: unknown) => void;
    fail?: (error: { errMsg?: string }) => void;
  }): void;

  setImRankData?(options: {
    dataType: 0 | 1;
    value: string;
    priority: number;
    zoneId: string;
    success?: (result?: unknown) => void;
    fail?: (error: { errMsg?: string }) => void;
  }): void;
  getImRankList?(options: {
    rankType: string;
    dataType: 0 | 1;
    relationType: string;
    suffix: string;
    rankTitle: string;
    zoneId: string;
    success?: (result?: unknown) => void;
    fail?: (error: { errMsg?: string }) => void;
  }): void;
}
