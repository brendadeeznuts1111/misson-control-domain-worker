export function getSwaggerUIHTML(specUrl: string = '/api/openapi.json'): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mission Control API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1.5rem 2rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    .header h1 {
      margin: 0;
      font-size: 1.75rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .header p {
      margin: 0.5rem 0 0 0;
      opacity: 0.9;
      font-size: 0.95rem;
    }
    
    #swagger-ui {
      padding: 2rem;
    }
    
    .swagger-ui .topbar {
      display: none;
    }
    
    /* Dark theme adjustments */
    .swagger-ui .info .title {
      color: #667eea;
    }
    
    .swagger-ui .btn.authorize {
      background-color: #667eea;
      border-color: #667eea;
    }
    
    .swagger-ui .btn.authorize:hover {
      background-color: #764ba2;
      border-color: #764ba2;
    }
    
    .swagger-ui select {
      border-color: #667eea;
    }
    
    .swagger-ui .opblock.opblock-get .opblock-summary {
      border-color: #61affe;
    }
    
    .swagger-ui .opblock.opblock-post .opblock-summary {
      border-color: #49cc90;
    }
    
    .swagger-ui .opblock.opblock-put .opblock-summary {
      border-color: #fca130;
    }
    
    .swagger-ui .opblock.opblock-delete .opblock-summary {
      border-color: #f93e3e;
    }
    
    .badge {
      background: #667eea;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-left: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>
      🚀 Mission Control API
      <span class="badge">v0.5.1</span>
    </h1>
    <p>Interactive API documentation powered by OpenAPI 3.0</p>
  </div>
  
  <div id="swagger-ui"></div>
  
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        docExpansion: "list",
        filter: true,
        tryItOutEnabled: true,
        supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
        onComplete: function() {
          console.log("Swagger UI loaded successfully");
        },
        requestInterceptor: (request) => {
          // Add auth header if stored locally
          const apiKey = localStorage.getItem('mission-control-api-key');
          if (apiKey) {
            request.headers['X-API-Key'] = apiKey;
          }
          return request;
        },
        responseInterceptor: (response) => {
          // Store rate limit info for display
          const remaining = response.headers['x-ratelimit-remaining'];
          const limit = response.headers['x-ratelimit-limit'];
          if (remaining && limit) {
            console.log(\`Rate Limit: \${remaining}/\${limit} requests remaining\`);
          }
          return response;
        }
      });
      
      window.ui = ui;
    };
  </script>
</body>
</html>
`;
}