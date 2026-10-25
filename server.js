// Optional development server for the older browser-based version. The Electron app uses `npm start`.


// Built-in Node modules used by this optional local development server.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Serve files from the same folder as this script.
const ROOT = __dirname;
const PORT = 3000;

// Tell the browser whether each response is HTML, CSS or JavaScript.
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

// Optional server for running the older browser version during development.
const server = http.createServer((req, res) => {
  const pathname = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  ).pathname;

  const routes = {
    "/": "index.html",
    "/index.html": "index.html",
    "/style.css": "style.css",
    "/app.js": "app.js"
  };

  const filename = routes[pathname];

  if (!filename) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const filePath = path.join(ROOT, filename);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Could not read application file.");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filename)],
      "X-Content-Type-Options": "nosniff"
    });

    res.end(content);
  });
});

// Listen only on this computer, not on the wider network.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Emoji Vault running at http://127.0.0.1:${PORT}`);
  console.log("Press Ctrl+C to stop the server.");
});
