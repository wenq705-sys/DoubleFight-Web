export interface DouyinIdentity {
  openid: string;
  unionid?: string;
  anonymousOpenid?: string;
}

export interface DouyinProvider {
  exchange(credential: { code?: string; anonymousCode?: string }): Promise<DouyinIdentity>;
}

export class ProviderError extends Error {
  constructor(readonly category: 'configuration' | 'unavailable' | 'invalid_code' | 'invalid_response') {
    super(category);
  }
}

const ENDPOINT = 'https://developer.toutiao.com/api/apps/v2/jscode2session';

export class OfficialDouyinProvider implements DouyinProvider {
  constructor(
    private readonly appId: string | undefined,
    private readonly appSecret: string | undefined,
    private readonly request: typeof fetch = fetch,
  ) {}

  async exchange({ code, anonymousCode }: { code?: string; anonymousCode?: string }): Promise<DouyinIdentity> {
    if (!this.appId || !this.appSecret) throw new ProviderError('configuration');
    let response: Response;
    try {
      response = await this.request(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appid: this.appId, secret: this.appSecret, ...(code ? { code } : {}), ...(anonymousCode ? { anonymous_code: anonymousCode } : {}) }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { throw new ProviderError('unavailable'); }
    if (!response.ok) throw new ProviderError('unavailable');
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new ProviderError('invalid_response'); }
    if (!payload || typeof payload !== 'object') throw new ProviderError('invalid_response');
    const value = payload as { err_no?: unknown; data?: Record<string, unknown> };
    if (value.err_no !== 0) {
      if (value.err_no === 40018 || value.err_no === 40019) throw new ProviderError('invalid_code');
      throw new ProviderError('unavailable');
    }
    const data = value.data;
    const openid = typeof data?.openid === 'string' && data.openid ? data.openid : undefined;
    const anonymousOpenid = typeof data?.anonymous_openid === 'string' && data.anonymous_openid ? data.anonymous_openid : undefined;
    if (code && !openid) throw new ProviderError('invalid_response');
    if (!openid && !anonymousOpenid) throw new ProviderError('invalid_response');
    return {
      openid: openid ?? `anonymous:${anonymousOpenid}`,
      ...(typeof data?.unionid === 'string' && data.unionid ? { unionid: data.unionid } : {}),
      ...(anonymousOpenid ? { anonymousOpenid } : {}),
    };
  }
}
