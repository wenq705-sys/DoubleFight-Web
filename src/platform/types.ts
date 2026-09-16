export type SocketState = 'connecting' | 'open' | 'closing' | 'closed';

export interface SocketConnection {
  readonly readyState: SocketState;
  onOpen(listener: () => void): void;
  onMessage(listener: (data: string) => void): void;
  onError(listener: (error: unknown) => void): void;
  onClose(listener: () => void): void;
  send(data: string): void;
  close(): void;
}

export interface SocketTransport { connect(url: string): SocketConnection }
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type HapticIntent = 'light' | 'medium' | 'success' | 'error';
export interface HapticsAdapter { trigger(intent: HapticIntent): void }
export interface LifecycleAdapter {
  subscribe(onShow: () => void, onHide: () => void): () => void;
  readonly visible: boolean;
}
export interface SystemInfo {
  width: number;
  height: number;
  pixelRatio: number;
  runtime: 'browser' | 'douyin';
  safeArea: { top: number; right: number; bottom: number; left: number };
  menuButton?: { top: number; right: number; bottom: number; left: number; width: number; height: number };
}
export type AccountBootstrapResult =
  | { status: 'local'; isLoggedIn: false; identity: 'browser-anonymous' }
  | { status: 'logged_in'; isLoggedIn: true; code: string; anonymousCode?: string }
  | { status: 'anonymous'; isLoggedIn: false; anonymousCode: string }
  | { status: 'cancelled' | 'failed'; isLoggedIn: false; error?: string };
export interface AccountBootstrap { bootstrap(): Promise<AccountBootstrapResult>; reset?(): void }
export interface Platform {
  socket: SocketTransport;
  storage: StorageAdapter;
  haptics: HapticsAdapter;
  lifecycle: LifecycleAdapter;
  account: AccountBootstrap;
  getSystemInfo(): SystemInfo;
}
