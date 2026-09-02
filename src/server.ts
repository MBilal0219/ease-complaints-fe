import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Forward /api/* to the backend so this server behaves like `ng serve` +
 * proxy.conf.json (same purpose, different mechanism — this Express server
 * has no equivalent of the Angular CLI dev-server's built-in proxy). Without
 * this, requests to /api/* fall through to the Angular catch-all route below
 * and get redirected/rendered as if they were app URLs instead of reaching
 * the API. Target is overridable via API_PROXY_TARGET for other environments.
 */
// Express strips the "/api" mount prefix from req.url before this middleware
// sees it, so the target must include "/api" itself to end up forwarding to
// e.g. http://127.0.0.1:4000/api/v1/auth/login instead of .../v1/auth/login.
app.use(
  '/api',
  createProxyMiddleware({
    target: `${process.env['API_PROXY_TARGET'] || 'http://127.0.0.1:4000'}/api`,
    changeOrigin: true,
  }),
);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
