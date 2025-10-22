export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Determine environment based on hostname
    let environment = 'production';
    if (url.hostname.includes('staging')) {
      environment = 'staging';
    } else if (url.hostname.includes('hub')) {
      environment = 'hub';
    }
    
    // Sample response
    return new Response(JSON.stringify({
      message: `Hello from Cloudflare Worker!`,
      environment: environment,
      hostname: url.hostname,
      path: url.pathname,
      timestamp: new Date().toISOString()
    }, null, 2), {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'x-environment': environment
      }
    });
  },
};
