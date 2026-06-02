const state = {
  ws: null,
  userId: '',
  userName: '',
  apps: [],
  activeAppId: null,
  messages: {},
  unread: {},
  typing: {},
  currentScreen: 'login',
  reconnectTimer: null,
  reconnectDelay: 3000,
  intentionallyClosed: false,
};

function connectWebSocket(userId, userName) {
  if (state.ws) {
    state.ws.skipReconnect = true;
    state.ws.close();
    state.ws = null;
  }

  clearReconnectTimer();
  state.userId = userId;
  state.userName = userName;
  state.intentionallyClosed = false;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  state.ws = ws;

  ws.addEventListener('open', () => {
    state.reconnectDelay = 3000;
    ws.send(JSON.stringify({ type: 'register', userId, userName }));
  });

  ws.addEventListener('message', async (event) => {
    try {
      const text = await websocketMessageToText(event.data);
      const data = JSON.parse(text);
      handleServerMessage(data);
    } catch (error) {
      console.error('failed to parse websocket message:', error);
    }
  });

  ws.addEventListener('close', () => {
    if (state.ws === ws) {
      state.ws = null;
    }

    clearAllTypingIndicators();

    if (!ws.skipReconnect && !state.intentionallyClosed && state.userId) {
      scheduleReconnect();
    }
  });

  ws.addEventListener('error', (error) => {
    console.error('websocket error:', error);
  });
}

function handleServerMessage(data) {
  if (!data || typeof data.type !== 'string') return;

  if (data.type === 'registered') {
    clearReconnectTimer();
    state.reconnectDelay = 3000;
    showScreen('agents');
    return;
  }

  if (data.type === 'app_list') {
    state.apps = Array.isArray(data.apps) ? data.apps : [];

    if (state.activeAppId && !state.apps.some((app) => app.appId === state.activeAppId)) {
      state.activeAppId = null;
      if (state.currentScreen === 'chat') {
        showScreen('agents');
      }
    }

    renderAgentList();
    if (state.activeAppId) {
      updateChatHeader();
    }
    return;
  }

  if (data.type === 'message') {
    const appId = data.appId || '';
    if (!appId || typeof data.content !== 'string') return;
    removeTypingIndicator(appId);
    addMessage(appId, 'agent', data.content);
    renderAgentList();
    return;
  }

  if (data.type === 'typing_start') {
    const appId = data.appId || '';
    if (!appId) return;
    addTypingIndicator(appId);
    return;
  }

  if (data.type === 'typing_error') {
    const appId = data.appId || '';
    if (!appId) return;
    showTypingError(appId, data.error);
    return;
  }

  if (data.type === 'history') {
    const messages = data.messages && typeof data.messages === 'object' ? data.messages : {};
    for (const [appId, appMessages] of Object.entries(messages)) {
      if (!Array.isArray(appMessages)) continue;
      state.messages[appId] = appMessages
        .filter((message) => message && typeof message.content === 'string')
        .map((message) => ({
          role: message.from === 'user' || message.role === 'user' ? 'user' : 'agent',
          content: message.content,
          timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
        }));
    }

    renderAgentList();
    if (state.currentScreen === 'chat') {
      renderMessages();
    }
    return;
  }

  if (data.type === 'error') {
    console.error('server error:', data.error || data);
  }
}

function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });

  const screen = document.getElementById(`screen-${screenName}`);
  if (!screen) return;

  screen.classList.add('active');
  state.currentScreen = screenName;

  if (screenName === 'login') {
    requestAnimationFrame(() => document.getElementById('username-input').focus());
  } else if (screenName === 'agents') {
    document.getElementById('current-user').textContent = state.userName || state.userId;
    renderAgentList();
  } else if (screenName === 'chat') {
    requestAnimationFrame(() => document.getElementById('message-input').focus());
  }
}

function renderAgentList() {
  const list = document.getElementById('agent-list');
  list.innerHTML = '';

  if (state.apps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '暂无可用 Agent';
    list.appendChild(empty);
    return;
  }

  state.apps.forEach((app) => {
    const appId = app.appId || '';
    const name = app.name || appId;
    const lastMessage = getLastMessage(appId);
    const unreadCount = state.unread[appId] || 0;

    const card = document.createElement('div');
    card.className = 'agent-card';
    card.addEventListener('click', () => switchApp(appId));

    const avatar = document.createElement('div');
    avatar.className = 'agent-avatar';
    avatar.textContent = getAvatarText(name);

    const info = document.createElement('div');
    info.className = 'agent-info';

    const title = document.createElement('div');
    title.className = 'agent-name';
    title.textContent = name;

    const id = document.createElement('div');
    id.className = 'agent-id';
    id.textContent = appId;

    const preview = document.createElement('div');
    preview.className = 'agent-preview';
    preview.textContent = lastMessage
      ? `${lastMessage.role === 'user' ? '我' : name}: ${lastMessage.content}`
      : '新对话';

    info.append(title, id, preview);
    card.append(avatar, info);

    if (unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'unread-badge';
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      card.appendChild(badge);
    }

    list.appendChild(card);
  });
}

function switchApp(appId) {
  if (!appId) return;

  state.activeAppId = appId;
  state.unread[appId] = 0;
  updateChatHeader();
  renderMessages();
  renderAgentList();
  showScreen('chat');
}

function renderMessages() {
  const list = document.getElementById('message-list');
  list.innerHTML = '';

  const messages = state.messages[state.activeAppId] || [];
  messages.forEach((message) => {
    const row = document.createElement('div');
    row.className = `message ${message.role === 'user' ? 'user' : 'agent'}`;

    const content = document.createElement('div');
    content.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = message.content;

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(message.timestamp);

    content.append(bubble, time);
    row.appendChild(content);
    list.appendChild(row);
  });

  renderTypingIndicator(list, state.activeAppId);
  scrollMessagesToBottom();
}

function addMessage(appId, role, content) {
  state.messages[appId] = state.messages[appId] || [];
  state.messages[appId].push({ role, content, timestamp: Date.now() });

  if (state.activeAppId === appId && state.currentScreen === 'chat') {
    renderMessages();
  } else {
    state.unread[appId] = (state.unread[appId] || 0) + 1;
  }
}

function addTypingIndicator(appId) {
  removeTypingIndicator(appId, { render: false });

  const typing = {
    kind: 'start',
    startedAt: Date.now(),
    visible: false,
    showTimer: window.setTimeout(() => {
      typing.visible = true;
      if (state.activeAppId === appId && state.currentScreen === 'chat') {
        renderMessages();
      }
    }, 150),
    timeoutTimer: window.setTimeout(() => {
      showTypingError(appId, '回复超时，请稍后再试');
    }, 120000),
  };

  state.typing[appId] = typing;
}

function removeTypingIndicator(appId, options = {}) {
  const typing = state.typing[appId];
  if (!typing) return;

  clearTypingTimers(typing);
  delete state.typing[appId];

  if (options.render === false) return;
  if (state.activeAppId === appId && state.currentScreen === 'chat') {
    renderMessages();
  }
}

function showTypingError(appId, error) {
  const existing = state.typing[appId];
  if (existing) {
    clearTypingTimers(existing);
  }

  state.typing[appId] = {
    kind: 'error',
    startedAt: Date.now(),
    error: typeof error === 'string' && error.trim() ? error : '回复失败',
    visible: true,
    showTimer: null,
    timeoutTimer: null,
  };

  if (state.activeAppId === appId && state.currentScreen === 'chat') {
    renderMessages();
  }
}

function renderTypingIndicator(list, appId) {
  const typing = state.typing[appId];
  if (!typing || !typing.visible) return;

  const row = document.createElement('div');
  row.className = `message agent typing ${typing.kind === 'error' ? 'typing-error' : ''}`;
  row.setAttribute('aria-label', typing.kind === 'error' ? '回复出错' : '对方正在输入');

  const content = document.createElement('div');
  content.className = 'message-content';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (typing.kind === 'error') {
    bubble.textContent = typing.error || '回复失败';
  } else {
    const dots = document.createElement('span');
    dots.className = 'typing-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) {
      dots.appendChild(document.createElement('span'));
    }
    bubble.appendChild(dots);
  }

  content.appendChild(bubble);
  row.appendChild(content);
  list.appendChild(row);
}

function clearAllTypingIndicators() {
  for (const typing of Object.values(state.typing)) {
    clearTypingTimers(typing);
  }
  state.typing = {};

  if (state.currentScreen === 'chat') {
    renderMessages();
  }
}

function clearTypingTimers(typing) {
  if (typing.showTimer) {
    clearTimeout(typing.showTimer);
  }
  if (typing.timeoutTimer) {
    clearTimeout(typing.timeoutTimer);
  }
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text || !state.activeAppId) return;

  input.value = '';
  addMessage(state.activeAppId, 'user', text);
  renderAgentList();

  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    console.error('websocket is not connected');
    return;
  }

  state.ws.send(JSON.stringify({
    type: 'message',
    appId: state.activeAppId,
    content: text,
  }));
}

function scheduleReconnect() {
  if (state.reconnectTimer) return;

  const delay = state.reconnectDelay;
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    if (!state.intentionallyClosed && state.userId) {
      connectWebSocket(state.userId, state.userName);
      state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30000);
    }
  }, delay);
}

function cleanDisconnect() {
  state.intentionallyClosed = true;
  clearReconnectTimer();

  if (state.ws) {
    state.ws.skipReconnect = true;
    state.ws.close();
  }

  state.ws = null;
}

function resetState() {
  cleanDisconnect();
  state.userId = '';
  state.userName = '';
  state.apps = [];
  state.activeAppId = null;
  state.messages = {};
  state.unread = {};
  clearAllTypingIndicators();
  state.currentScreen = 'login';
  state.reconnectDelay = 3000;
  document.getElementById('username-input').value = '';
  document.getElementById('message-input').value = '';
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function updateChatHeader() {
  const app = state.apps.find((item) => item.appId === state.activeAppId);
  const name = app ? app.name || app.appId : state.activeAppId || '';
  document.getElementById('chat-agent-avatar').textContent = getAvatarText(name);
  document.getElementById('chat-agent-name').textContent = name;
}

function getLastMessage(appId) {
  const messages = state.messages[appId] || [];
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

function getAvatarText(name) {
  const chars = Array.from(String(name || '?').trim());
  const emoji = chars.find((char) => /\p{Emoji_Presentation}/u.test(char));
  return emoji || (chars[0] || '?').toUpperCase();
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scrollMessagesToBottom() {
  const list = document.getElementById('message-list');
  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

async function websocketMessageToText(data) {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn').addEventListener('click', () => {
    const username = document.getElementById('username-input').value.trim();
    if (!username) {
      document.getElementById('username-input').focus();
      return;
    }

    connectWebSocket(username, username);
  });

  document.getElementById('username-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      document.getElementById('login-btn').click();
    }
  });

  document.getElementById('send-btn').addEventListener('click', sendMessage);

  document.getElementById('message-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      sendMessage();
    }
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    renderAgentList();
    showScreen('agents');
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    resetState();
    showScreen('login');
  });

  window.addEventListener('beforeunload', () => {
    cleanDisconnect();
  });
});
