#!/usr/bin/env node

/**
 * Simple development server with COOP/COEP headers for SharedArrayBuffer support
 *
 * Usage:
 *   node dev-server.js [port] [directory]
 *
 * Example:
 *   node dev-server.js 8080 .
 *   npm run dev
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.argv[2] || 8080;
const ROOT_DIR = process.argv[3] || '.';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain',
    '.xml': 'application/xml'
};

const server = http.createServer((req, res) => {
    // Parse URL
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Default to index.html for root
    if (pathname === '/') {
        pathname = '/index.html';
    }

    const filePath = path.join(ROOT_DIR, pathname);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    // Read and serve file
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
            }
            console.error(`${req.method} ${pathname} - ${err.code}`);
        } else {
            // Set COOP/COEP headers for SharedArrayBuffer support
            const headers = {
                'Content-Type': mimeType,
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
                'Cache-Control': 'no-cache'
            };

            // Add CORP header for cross-origin resources
            if (ext === '.js' || ext === '.mjs' || ext === '.wasm') {
                headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
            }

            res.writeHead(200, headers);
            res.end(data);
            console.log(`${req.method} ${pathname} - 200`);
        }
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  Development Server with COOP/COEP Headers          ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Server running at: http://localhost:${PORT}`);
    console.log(`  Serving directory: ${path.resolve(ROOT_DIR)}`);
    console.log('');
    console.log('  Headers enabled:');
    console.log('    ✓ Cross-Origin-Opener-Policy: same-origin');
    console.log('    ✓ Cross-Origin-Embedder-Policy: require-corp');
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('');
});
