import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  auth,
  hasFirebaseConfig,
  loginWithGoogle,
  logoutUser,
  onAuthStateChanged,
} from './lib/firebase';
import './App.css';

const WEBHOOK_URL =
  import.meta.env.VITE_N8N_WEBHOOK_URL ||
  'https://akki190804.app.n8n.cloud/webhook/fc3c4c7d-0a22-45c3-961a-7ba309d8dedf';

const THEME_KEY = 'gemini-theme';

function getChatStorageKey(user) {
  return user?.uid ? `gemini-chat-sessions-${user.uid}` : 'gemini-chat-sessions-guest';
}

function createChat(prompt) {
  return {
    id: crypto.randomUUID(),
    title: prompt.slice(0, 42) || 'New chat',
    createdAt: new Date().toISOString(),
    messages: [],
  };
}

function getInitialTheme() {
  const storedTheme = localStorage.getItem(THEME_KEY);
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredChats(user) {
  try {
    const raw = localStorage.getItem(getChatStorageKey(user));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractReplyText(payload) {
  if (typeof payload === 'string') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map(extractReplyText).filter(Boolean).join('\n\n');
  }

  if (!payload || typeof payload !== 'object') {
    return 'The workflow responded, but the reply format was empty.';
  }

  const candidateKeys = ['output', 'reply', 'response', 'text', 'message', 'content', 'answer', 'result'];

  for (const key of candidateKeys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  if (payload.data) {
    return extractReplyText(payload.data);
  }

  return JSON.stringify(payload, null, 2);
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [sessions, setSessions] = useState(() => readStoredChats(null));
  const [activeChatId, setActiveChatId] = useState(() => readStoredChats(null)[0]?.id ?? null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authError, setAuthError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const endRef = useRef(null);
  const menuRef = useRef(null);

  const activeChat = useMemo(
    () => sessions.find((session) => session.id === activeChatId) ?? null,
    [sessions, activeChatId],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(getChatStorageKey(authUser), JSON.stringify(sessions));
  }, [sessions, authUser]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat, isSending]);

  useEffect(() => {
    if (!auth) {
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setPhotoFailed(false);
      const nextSessions = readStoredChats(user);
      setSessions(nextSessions);
      setActiveChatId(nextSessions[0]?.id ?? null);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const startNewChat = () => {
    const newChat = createChat('');
    setSessions((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setInput('');
  };

  const handleSend = async (event) => {
    event?.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    let currentChatId = activeChatId;

    if (!currentChatId) {
      const newChat = createChat(trimmed);
      setSessions((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      currentChatId = newChat.id;
    }

    const previousMessages =
      sessions.find((session) => session.id === currentChatId)?.messages?.map((message) => ({
        role: message.role,
        text: message.text,
      })) ?? [];

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    setInput('');
    setIsSending(true);

    setSessions((prev) =>
      prev.map((session) =>
        session.id === currentChatId
          ? {
              ...session,
              title: session.messages.length ? session.title : trimmed.slice(0, 42),
              messages: [...session.messages, userMessage],
            }
          : session,
      ),
    );

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: trimmed,
          message: trimmed,
          chatId: currentChatId,
          history: previousMessages,
          user: authUser
            ? {
                uid: authUser.uid,
                name: authUser.displayName,
                email: authUser.email,
                photoURL: authUser.photoURL,
              }
            : null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status}`);
      }

      const modelMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text: extractReplyText(data),
        createdAt: new Date().toISOString(),
      };

      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentChatId
            ? {
                ...session,
                messages: [...session.messages, userMessage, modelMessage].filter(
                  (message, index, array) =>
                    array.findIndex((item) => item.id === message.id) === index,
                ),
              }
            : session,
        ),
      );
    } catch (error) {
      const modelMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text:
          error instanceof Error
            ? `I could not reach the n8n workflow.\n\n${error.message}`
            : 'I could not reach the n8n workflow.',
        createdAt: new Date().toISOString(),
      };

      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentChatId
            ? {
                ...session,
                messages: [...session.messages, userMessage, modelMessage].filter(
                  (message, index, array) =>
                    array.findIndex((item) => item.id === message.id) === index,
                ),
              }
            : session,
        ),
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleLogin = async () => {
    setAuthError('');
    setMenuOpen(false);

    try {
      await loginWithGoogle();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login failed.');
    }
  };

  const handleLogout = async () => {
    setAuthError('');
    setMenuOpen(false);

    try {
      await logoutUser();
      const guestSessions = readStoredChats(null);
      setSessions(guestSessions);
      setActiveChatId(guestSessions[0]?.id ?? null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Logout failed.');
    }
  };

  const userInitial = (authUser?.displayName?.[0] || authUser?.email?.[0] || 'U').toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="gemini-mark">*</div>
            <span>Gemini</span>
          </div>

          <button className="sidebar-action" onClick={startNewChat}>
            <span>+</span>
            New chat
          </button>
        </div>

        <div className="history-panel">
          <p className="section-label">Recent chats</p>
          <div className="history-list">
            {sessions.length === 0 ? (
              <p className="empty-history">Your chat history will appear here.</p>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  className={`history-item ${session.id === activeChatId ? 'active' : ''}`}
                  onClick={() => setActiveChatId(session.id)}
                >
                  {session.title || 'New chat'}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            className="theme-toggle"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="model-pill">
            <span className="model-pill-badge">2.0</span>
            <span>Gemini</span>
          </div>

          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="Toggle theme"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            >
              <span className={theme === 'dark' ? 'theme-icon sun-icon' : 'theme-icon moon-icon'} />
            </button>

            <div className="profile-menu-wrap" ref={menuRef}>
              <button
                className="profile-trigger"
                type="button"
                aria-label="Profile"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                {authUser?.photoURL && !photoFailed ? (
                  <img
                    src={authUser.photoURL}
                    alt={authUser.displayName || 'User'}
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <div className="profile-dot">{authUser ? userInitial : 'U'}</div>
                )}
              </button>

              {menuOpen ? (
                <div className="profile-menu">
                  {authUser ? (
                    <>
                      <div className="profile-menu-head">
                        <strong>{authUser.displayName || 'Signed in'}</strong>
                        <small>{authUser.email}</small>
                      </div>
                      <button className="profile-menu-item" type="button" onClick={handleLogout}>
                        Logout
                      </button>
                    </>
                  ) : (
                    <button
                      className="profile-menu-item"
                      type="button"
                      onClick={handleLogin}
                    >
                      {hasFirebaseConfig ? 'Login with Google' : 'Login with Google'}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <section className="chat-stage">
          {!activeChat || activeChat.messages.length === 0 ? (
            <div className="landing">
              <div className="landing-copy">
                <div className="hero-line">
                  <div className="hero-gemini-icon" aria-hidden="true">
                    <span className="gemini-spark gemini-spark-blue" />
                    <span className="gemini-spark gemini-spark-green" />
                    <span className="gemini-spark gemini-spark-yellow" />
                    <span className="gemini-spark gemini-spark-red" />
                  </div>
                  <p className="eyebrow">{authUser ? 'Welcome back' : 'Sign in to keep your chats'}</p>
                </div>
                <h1>Where should we start?</h1>
              </div>

              <form className="hero-composer hero-composer-landing" onSubmit={handleSend}>
                <div className="hero-composer-top">
                  <textarea
                    rows="1"
                    placeholder="Ask Gemini"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>

                <div className="hero-composer-bottom">
                  <div className="hero-composer-actions">
                    <button className="hero-icon-button" type="button" aria-label="Add">
                      +
                    </button>
                    <button className="hero-tools-button" type="button">
                      Tools
                    </button>
                  </div>

                  <button
                    className="send-button wide"
                    type="submit"
                    disabled={!input.trim() || isSending}
                  >
                    Send
                  </button>
                </div>
              </form>

              {authError ? <p className="auth-error">{authError}</p> : null}
            </div>
          ) : (
            <div className="messages">
              {activeChat.messages.map((message) => (
                <article
                  key={message.id}
                  className={`message-row ${message.role === 'user' ? 'user' : 'model'}`}
                >
                  <div className="message-avatar">{message.role === 'user' ? userInitial : '*'}</div>
                  <div className="message-card">
                    {message.role === 'model' ? (
                      <ReactMarkdown>{message.text}</ReactMarkdown>
                    ) : (
                      <p>{message.text}</p>
                    )}
                  </div>
                </article>
              ))}

              {isSending ? (
                <article className="message-row model">
                  <div className="message-avatar">*</div>
                  <div className="message-card loading-card">
                    <span />
                    <span />
                    <span />
                  </div>
                </article>
              ) : null}
              <div ref={endRef} />
            </div>
          )}
        </section>

        <footer className="composer-wrap">
          {activeChat && activeChat.messages.length > 0 ? (
            <>
              <form className="composer" onSubmit={handleSend}>
                <button className="composer-icon" type="button" aria-label="Add">
                  +
                </button>
                <textarea
                  rows="1"
                  placeholder="Ask Gemini"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button className="send-button wide" type="submit" disabled={!input.trim() || isSending}>
                  Send
                </button>
              </form>
              {authError ? <p className="auth-error composer-error">{authError}</p> : null}
              <p className="composer-note">Gemini can make mistakes, so double-check important info.</p>
            </>
          ) : null}
        </footer>
      </main>
    </div>
  );
}

export default App;
