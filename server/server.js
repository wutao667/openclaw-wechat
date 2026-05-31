import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 3100);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const browsers = new Map();
const browserMeta = new WeakMap();
const plugins = new Map();
const pluginMeta = new WeakMap();
const agentIndex = new Map();
const messageHistory = new Map();
const heartbeatMeta = new WeakMap();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }

  serveStatic(url.pathname, res);
});

const browserWss = new WebSocketServer({ noServer: true });
const pluginWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/ws') {
    browserWss.handleUpgrade(req, socket, head, (ws) => {
      browserWss.emit('connection', ws, req);
    });
    return;
  }

  if (url.pathname === '/plugin') {
    pluginWss.handleUpgrade(req, socket, head, (ws) => {
      pluginWss.emit('connection', ws, req);
    });
    return;
  }

  socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
  socket.destroy();
});

browserWss.on("connection", (ws) => {
  console.log("browser connected");
  initHeartbeat(ws);

  ws.on('pong', () => markPong(ws));
  ws.on('message', (raw) => {
    const message = parseJson(raw);
    if (!message) return;

    if (message.type === 'register') {
      registerBrowser(ws, message);
      return;
    }

    if (message.type === 'message') {
      handleBrowserMessage(ws, message);
    }
  });

  ws.on('close', () => removeBrowser(ws));
});

pluginWss.on("connection", (ws) => {
  console.log("plugin connected");
  initHeartbeat(ws);

  ws.on('pong', () => markPong(ws));
  ws.on('message', (raw) => {
    const message = parseJson(raw);
    if (!message) return;

    if (message.type === 'register') {
      registerPlugin(ws, message);
      return;
    }

    if (message.type === 'outgoing') {
      handlePluginOutgoing(ws, message);
    }
  });

  ws.on('close', () => removePlugin(ws));
});

const heartbeatTimer = setInterval(() => {
  pingConnections(browserWss);
  pingConnections(pluginWss);
}, 30_000);

heartbeatTimer.unref();

server.listen(PORT, () => {
  console.log(`webchat server listening on http://localhost:${PORT}`);
});

function serveStatic(pathname, res) {
  const decodedPath = safeDecode(pathname);
  if (!decodedPath) {
    sendText(res, 400, 'Bad Request');
    return;
  }

  const relativePath = decodedPath === '/' || decodedPath === '/index.html'
    ? 'index.html'
    : decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(publicDir, relativePath);

  if (!filePath.startsWith(publicDir + path.sep) && filePath !== publicDir) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      sendText(res, 404, 'Not Found');
      return;
    }

    const body = fs.readFileSync(filePath);
    const contentType = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': contentType });
    res.end(body);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      sendText(res, 404, 'Not Found');
      return;
    }

    console.error('static file error:', error);
    sendText(res, 500, 'Internal Server Error');
  }
}

function registerBrowser(ws, message) {
  console.log("registering browser:", message.userId);
  const userId = typeof message.userId === 'string' && message.userId.trim() ? message.userId : null;
  const userName = typeof message.userName === 'string' && message.userName.trim() ? message.userName : userId;

  if (!userId) {
    send(ws, { type: 'error', error: 'userId is required' });
    return;
  }

  removeBrowser(ws);

  let sockets = browsers.get(userId);
  if (!sockets) {
    sockets = new Set();
    browsers.set(userId, sockets);
  }

  sockets.add(ws);
  browserMeta.set(ws, { userId, userName, lastSeen: Date.now() });

  send(ws, { type: 'registered', userId });
  send(ws, { type: 'agent_list', agents: getBrowserAgentList() });
  send(ws, { type: 'history', messages: getUserHistory(userId) });
}

function registerPlugin(ws, message) {
  console.log("registering plugin:", message.pluginId);
  const pluginId = typeof message.pluginId === 'string' && message.pluginId.trim() ? message.pluginId : null;
  const agents = Array.isArray(message.agents)
    ? message.agents
        .filter((agent) => agent && typeof agent.agentId === 'string' && agent.agentId.trim())
        .map((agent) => ({
          agentId: agent.agentId,
          name: typeof agent.name === 'string' && agent.name.trim() ? agent.name : agent.agentId,
        }))
    : [];

  if (!pluginId) {
    send(ws, { type: 'registered', ok: false, error: 'pluginId is required' });
    return;
  }

  const existing = plugins.get(pluginId);
  if (existing) {
    clearPluginAgents(existing);
  }

  if (existing && existing.ws !== ws) {
    existing.ws.close();
  }

  const plugin = { ws, pluginId, agents, lastSeen: Date.now() };
  plugins.set(pluginId, plugin);
  pluginMeta.set(ws, { pluginId, lastSeen: Date.now() });

  for (const agent of agents) {
    agentIndex.set(agent.agentId, pluginId);
  }

  send(ws, { type: 'registered', ok: true });
  send(ws, { type: 'agent_list', agents: getPluginAgentList() });
  broadcastAgentList();
}

function handleBrowserMessage(ws, message) {
  const meta = browserMeta.get(ws);
  if (!meta) {
    send(ws, { type: 'error', error: 'browser must register first' });
    return;
  }

  const agentId = typeof message.agentId === 'string' && message.agentId.trim() ? message.agentId : null;
  const content = typeof message.content === 'string' ? message.content : null;

  if (!agentId || content === null) {
    send(ws, { type: 'error', error: 'agentId and content are required' });
    return;
  }

  const pluginId = agentIndex.get(agentId);
  const plugin = pluginId ? plugins.get(pluginId) : null;

  if (!plugin || plugin.ws.readyState !== WebSocket.OPEN) {
    send(ws, { type: 'error', error: `agent is unavailable: ${agentId}` });
    return;
  }

  const messageId = typeof message.messageId === 'string' && message.messageId.trim()
    ? message.messageId
    : createMessageId('user');

  storeMessage(meta.userId, agentId, {
    role: 'user',
    content,
    timestamp: Date.now(),
    messageId,
  });

  send(plugin.ws, {
    type: 'incoming',
    userId: meta.userId,
    userName: meta.userName,
    agentId,
    conversationId: meta.userId,
    content,
    messageId,
  });
}

function handlePluginOutgoing(ws, message) {
  const meta = pluginMeta.get(ws);
  if (!meta) {
    send(ws, { type: 'error', error: 'plugin must register first' });
    return;
  }

  const pluginId = typeof message.pluginId === 'string' && message.pluginId.trim() ? message.pluginId : meta.pluginId;
  const agentId = typeof message.agentId === 'string' && message.agentId.trim() ? message.agentId : null;
  const userId = typeof message.userId === 'string' && message.userId.trim() ? message.userId : null;
  const content = typeof message.content === 'string' ? message.content : null;

  if (pluginId !== meta.pluginId || !agentId || !userId || content === null) {
    send(ws, { type: 'error', error: 'pluginId, agentId, userId, and content are required' });
    return;
  }

  const messageId = typeof message.messageId === 'string' && message.messageId.trim()
    ? message.messageId
    : createMessageId('agent');
  const outbound = {
    type: 'message',
    from: `agent:${agentId}`,
    agentId,
    content,
  };

  storeMessage(userId, agentId, {
    role: 'agent',
    content,
    timestamp: Date.now(),
    messageId,
  });

  const sockets = browsers.get(userId);
  if (!sockets) return;

  for (const browser of sockets) {
    send(browser, outbound);
  }
}

function removeBrowser(ws) {
  const meta = browserMeta.get(ws);
  if (!meta) return;

  const sockets = browsers.get(meta.userId);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      browsers.delete(meta.userId);
    }
  }
}

function removePlugin(ws) {
  const meta = pluginMeta.get(ws);
  if (!meta) return;

  const plugin = plugins.get(meta.pluginId);
  if (!plugin || plugin.ws !== ws) return;

  clearPluginAgents(plugin);
  plugins.delete(meta.pluginId);
  broadcastAgentList();
}

function clearPluginAgents(plugin) {
  for (const agent of plugin.agents) {
    if (agentIndex.get(agent.agentId) === plugin.pluginId) {
      agentIndex.delete(agent.agentId);
    }
  }
}

function storeMessage(userId, agentId, message) {
  const key = `${userId}:${agentId}`;
  const messages = messageHistory.get(key) || [];
  messages.push(message);

  if (messages.length > 100) {
    messages.splice(0, messages.length - 100);
  }

  messageHistory.set(key, messages);
}

function getUserHistory(userId) {
  const prefix = `${userId}:`;
  const messagesByAgent = {};

  for (const [key, messages] of messageHistory.entries()) {
    if (!key.startsWith(prefix)) continue;

    const agentId = key.slice(prefix.length);
    messagesByAgent[agentId] = messages;
  }

  return messagesByAgent;
}

function getBrowserAgentList() {
  return Array.from(plugins.values()).flatMap((plugin) => (
    plugin.agents.map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
    }))
  ));
}

function getPluginAgentList() {
  return Array.from(plugins.values()).flatMap((plugin) => (
    plugin.agents.map((agent) => ({
      pluginId: plugin.pluginId,
      agentId: agent.agentId,
      name: agent.name,
    }))
  ));
}

function broadcastAgentList() {
  const browserAgentList = getBrowserAgentList();
  for (const sockets of browsers.values()) {
    for (const ws of sockets) {
      send(ws, { type: 'agent_list', agents: browserAgentList });
    }
  }

  const pluginAgentList = getPluginAgentList();
  for (const plugin of plugins.values()) {
    send(plugin.ws, { type: 'agent_list', agents: pluginAgentList });
  }
}

function pingConnections(wss) {
  for (const ws of wss.clients) {
    const meta = heartbeatMeta.get(ws) || { missedPongs: 0 };

    if (meta.missedPongs >= 3) {
      ws.close();
      continue;
    }

    meta.missedPongs += 1;
    heartbeatMeta.set(ws, meta);
    ws.ping();
  }
}

function initHeartbeat(ws) {
  heartbeatMeta.set(ws, { missedPongs: 0 });
}

function markPong(ws) {
  heartbeatMeta.set(ws, { missedPongs: 0 });

  const now = Date.now();
  const browser = browserMeta.get(ws);
  if (browser) {
    browser.lastSeen = now;
  }

  const plugin = pluginMeta.get(ws);
  if (plugin) {
    plugin.lastSeen = now;
    const registeredPlugin = plugins.get(plugin.pluginId);
    if (registeredPlugin && registeredPlugin.ws === ws) {
      registeredPlugin.lastSeen = now;
    }
  }
}

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

function parseJson(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function createMessageId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeDecode(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}
