import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

interface Env {
  __STATIC_CONTENT: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const asset = await getAssetFromKV(
        {
          request,
          waitUntil: (promise: Promise<any>) => {
            // Handle waitUntil if needed
          },
        } as any,
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
        } as any
      );
      return asset;
    } catch (error: any) {
      // If asset not found and it's a navigation request, serve index.html
      if (request.method === 'GET' && !request.url.includes('.')) {
        try {
          return await getAssetFromKV(
            {
              request: new Request(new URL('/index.html', request.url), request),
              waitUntil: (promise: Promise<any>) => {},
            } as any,
            {
              ASSET_NAMESPACE: env.__STATIC_CONTENT,
            } as any
          );
        } catch (e) {
          // Fall through
        }
      }
      return new Response('Not Found', { status: 404 });
    }
  },
};
