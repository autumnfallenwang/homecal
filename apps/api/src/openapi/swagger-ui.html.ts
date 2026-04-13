/**
 * Standalone Swagger UI page that loads from a CDN and points at our hand-
 * curated OpenAPI spec at `/api/openapi.json`. No `@hono/swagger-ui` dep —
 * just an HTML string. Versioned to `swagger-ui-dist@5` for OpenAPI 3.1
 * support.
 */
export const swaggerUiHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HomeCal API · Docs</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"
    />
    <style>
      body { margin: 0; background: #fafafa; }
      .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.addEventListener("load", () => {
        // biome-ignore lint: SwaggerUIBundle is injected by the CDN script
        window.ui = SwaggerUIBundle({
          url: "/api/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          docExpansion: "list",
          tryItOutEnabled: true,
        });
      });
    </script>
  </body>
</html>`;
