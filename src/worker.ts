interface Env {
  __STATIC_CONTENT: {
    get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Remove trailing slashes
    let pathname = url.pathname;
    if (pathname.endsWith('/') && pathname !== '/') {
      pathname = pathname.slice(0, -1);
    }

    try {
      // Try to serve the exact file
      let key = pathname.slice(1); // Remove leading slash
      
      // If it's a directory or root, serve index.html
      if (!key || !key.includes('.')) {
        key = 'index.html';
      }

      // Get the file from KV
      const file = await env.__STATIC_CONTENT.get(key, 'arrayBuffer');
      
      if (file) {
        // Determine content type
        const contentType = getContentType(key);
        return new Response(file, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
      
      // If not found and it's a navigation request, serve index.html
      if (request.method === 'GET' && !pathname.includes('.')) {
        const indexFile = await env.__STATIC_CONTENT.get('index.html', 'arrayBuffer');
        if (indexFile) {
          return new Response(indexFile, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

function getContentType(filename: string): string {
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filename.endsWith('.js')) return 'application/javascript';
  if (filename.endsWith('.css')) return 'text/css';
  if (filename.endsWith('.json')) return 'application/json';
  if (filename.endsWith('.svg')) return 'image/svg+xml';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.gif')) return 'image/gif';
  if (filename.endsWith('.woff2')) return 'font/woff2';
  if (filename.endsWith('.woff')) return 'font/woff';
  if (filename.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}
