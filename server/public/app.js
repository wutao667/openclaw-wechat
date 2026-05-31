const state = {
  ws: null,
  userId: '',
  userName: '',
  agents: [],
  activeAgentId: null,
  messages: {},
  unread: {},
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

  if (data.type === 'agent_list') {
    state.agents = Array.isArray(data.agents) ? data.agents : [];

    if (state.activeAgentId && !state.agents.some((agent) => agent.agentId === state.activeAgentId)) {
      state.activeAgentId = null;
      if (state.currentScreen === 'chat') {
        showScreen('agents');
      }
    }

    renderAgentList();
    if (state.activeAgentId) {
      updateChatHeader();
    }
    return;
  }

  if (data.type === 'message') {
    const agentId = data.agentId || extractAgentId(data.from);
    if (!agentId || typeof data.content !== 'string') return;
    addMessage(agentId, 'agent', data.content);
    renderAgentList();
    return;
  }

  if (data.type === 'history') {
    const messages = data.messages && typeof data.messages === 'object' ? data.messages : {};
    for (const [agentId, agentMessages] of Object.entries(messages)) {
      if (!Array.isArray(agentMessages)) continue;
      state.messages[agentId] = agentMessages
        .filter((message) => message && typeof message.content === 'string')
        .map((message) => ({
          role: message.role === 'user' ? 'user' : 'agent',
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

  if (state.agents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '暂无可用 Agent';
    list.appendChild(empty);
    return;
  }

  state.agents.forEach((agent) => {
    const agentId = agent.agentId || '';
    const name = agent.name || agentId;
    const lastMessage = getLastMessage(agentId);
    const unreadCount = state.unread[agentId] || 0;

    const card = document.createElement('div');
    card.className = 'agent-card';
    card.addEventListener('click', () => switchAgent(agentId));

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
    id.textContent = agentId;

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

function switchAgent(agentId) {
  if (!agentId) return;

  state.activeAgentId = agentId;
  state.unread[agentId] = 0;
  updateChatHeader();
  renderMessages();
  renderAgentList();
  showScreen('chat');
}

function renderMessages() {
  const list = document.getElementById('message-list');
  list.innerHTML = '';

  const messages = state.messages[state.activeAgentId] || [];
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

  scrollMessagesToBottom();
}

function addMessage(agentId, role, content) {
  state.messages[agentId] = state.messages[agentId] || [];
  state.messages[agentId].push({ role, content, timestamp: Date.now() });

  if (state.activeAgentId === agentId && state.currentScreen === 'chat') {
    renderMessages();
  } else {
    state.unread[agentId] = (state.unread[agentId] || 0) + 1;
  }
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text || !state.activeAgentId) return;

  input.value = '';
  addMessage(state.activeAgentId, 'user', text);
  renderAgentList();

  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    console.error('websocket is not connected');
    return;
  }

  state.ws.send(JSON.stringify({
    type: 'message',
    agentId: state.activeAgentId,
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
  state.agents = [];
  state.activeAgentId = null;
  state.messages = {};
  state.unread = {};
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
  const agent = state.agents.find((item) => item.agentId === state.activeAgentId);
  const name = agent ? agent.name || agent.agentId : state.activeAgentId || '';
  document.getElementById('chat-agent-avatar').textContent = getAvatarText(name);
  document.getElementById('chat-agent-name').textContent = name;
}

function getLastMessage(agentId) {
  const messages = state.messages[agentId] || [];
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

function getAvatarText(name) {
  const chars = Array.from(String(name || '?').trim());
  const emoji = chars.find((char) => /\p{Emoji_Presentation}/u.test(char));
  return emoji || (chars[0] || '?').toUpperCase();
}

function extractAgentId(from) {
  if (typeof from !== 'string') return '';
  return from.startsWith('agent:') ? from.slice('agent:'.length) : from;
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
