import { useState, useRef, useEffect, type FormEvent, type MouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Store } from '@tauri-apps/plugin-store';
import ReactMarkdown from 'react-markdown';
import './App.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const initialMessage: Message = {
  role: 'assistant',
  content: 'Hello! I am **⚡️ThunderMind⚡️**. How can I help you code today?'
};

function App() {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5-coder:7b');
  const [tempMode, setTempMode] = useState<string>('balanced');
  
  const [storeInstance, setStoreInstance] = useState<Store | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load store, past messages, and settings on mount
  useEffect(() => {
    async function initStore() {
      try {
        const store = await Store.load('chat-history.json');
        setStoreInstance(store);
        
        const savedMessages = await store.get<Message[]>('messages');
        if (savedMessages && Array.isArray(savedMessages) && savedMessages.length > 0) {
          setMessages(savedMessages);
        }

        const savedModel = await store.get<string>('selectedModel');
        if (savedModel) setSelectedModel(savedModel);

        const savedTempMode = await store.get<string>('tempMode');
        if (savedTempMode) setTempMode(savedTempMode);

      } catch (err) {
        console.error('Failed to load store:', err);
      } finally {
        setIsInitialized(true);
      }
    }
    initStore();
  }, []);

  // Save messages to disk whenever they update
  useEffect(() => {
    if (!isInitialized || !storeInstance) return;
    async function saveHistory() {
      try {
        await storeInstance.set('messages', messages);
        await storeInstance.save();
      } catch (err) {
        console.error('Failed to save chat history:', err);
      }
    }
    saveHistory();
  }, [messages, isInitialized, storeInstance]);

  // Save settings instantly when they change
  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    if (storeInstance) {
      try {
        await storeInstance.set('selectedModel', model);
        await storeInstance.save();
      } catch (err) {
        console.error('Failed to save selected model:', err);
      }
    }
  };

  const handleTempModeChange = async (mode: string) => {
    setTempMode(mode);
    if (storeInstance) {
      try {
        await storeInstance.set('tempMode', mode);
        await storeInstance.save();
      } catch (err) {
        console.error('Failed to save temp mode:', err);
      }
    }
  };

  // Convert friendly mode to actual Ollama temperature float
  const getTemperatureValue = (mode: string): number => {
    switch (mode) {
      case 'precise': return 0.1;
      case 'balanced': return 0.4;
      case 'creative': return 0.8;
      default: return 0.4;
    }
  };

  // Clear chat history function
  const clearHistory = async () => {
    const freshMessages = [initialMessage];
    setMessages(freshMessages);
    if (storeInstance) {
      try {
        await storeInstance.set('messages', freshMessages);
        await storeInstance.save();
      } catch (err) {
        console.error('Failed to clear history on disk:', err);
      }
    }
  };

  // Handle native window dragging
  const handleMouseDown = async (e: MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      const appWindow = getCurrentWindow();
      await appWindow.startDragging();
    }
  };

  // Function to send prompt and stream response from local Ollama instance
  const sendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '' }
    ]);
    setLoading(true);

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          prompt: userMessage,
          stream: true,
          options: {
            temperature: getTemperatureValue(tempMode)
          }
        })
      });

      if (!response.body) throw new Error('ReadableStream not supported.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedResponse = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim() !== '') {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              accumulatedResponse += parsed.response;
              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: 'assistant',
                  content: accumulatedResponse
                };
                return newMessages;
              });
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          role: 'assistant',
          content: '⚠️ **Error:** Could not connect to local Ollama service. Is it running?'
        };
        return newMessages;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container">
      {/* Draggable Title Bar */}
      <div onMouseDown={handleMouseDown} className="window-header">
        <span className="window-title">⚡️ThunderMind⚡️</span>
        <div className="header-actions">
          <button 
            type="button" 
            onClick={() => setIsSettingsOpen(true)} 
            className="header-btn"
            title="Open Settings"
          >
            ⚙️ Settings
          </button>
          <button 
            type="button" 
            onClick={clearHistory} 
            className="header-btn"
            title="Clear Chat History"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* Settings Modal Overlay */}
      {isSettingsOpen && (
        <div className="settings-modal-overlay">
          <div className="settings-modal">
            <div className="settings-header">
              <h3>ThunderMind Preferences</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="close-btn">✕</button>
            </div>
            
            <div className="settings-field">
              <label><strong>Local Model</strong></label>
              <select 
                value={selectedModel} 
                onChange={(e) => handleModelChange(e.target.value)}
                className="settings-select"
              >
                <option value="qwen2.5-coder:7b">qwen2.5-coder:7b (Recommended)</option>
                <option value="deepseek-coder:6.7b">deepseek-coder:6.7b</option>
                <option value="llama3:8b">llama3:8b</option>
              </select>
            </div>

            <div className="settings-field">
              <label><strong>Assistant Mode</strong></label>
              <select 
                value={tempMode} 
                onChange={(e) => handleTempModeChange(e.target.value)}
                className="settings-select"
              >
                <option value="precise">🔒 Precise & Strict (Best for debugging & refactoring)</option>
                <option value="balanced">⚖️ Balanced (Best for general coding & Q&A)</option>
                <option value="creative">💡 Creative & Exploratory (Best for architecture & brainstorming)</option>
              </select>
              <p className="settings-hint">
                {tempMode === 'precise' && "Keeps outputs predictable and strictly adheres to syntax rules with minimal variance."}
                {tempMode === 'balanced' && "A great mix of logical accuracy and natural conversational explanation."}
                {tempMode === 'creative' && "Allows the model to think outside the box and suggest alternative approaches."}
              </p>
            </div>

            <div className="settings-footer">
              <button onClick={() => setIsSettingsOpen(false)} className="save-btn">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages Log */}
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <p className="message-sender"><strong>{msg.role === 'user' ? 'You' : '⚡️ThunderMind⚡️'}</strong></p>
            <div className="message-content">
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');

                      if (!inline && match) {
                        const [copied, setCopied] = useState(false);

                        const handleCopy = () => {
                          navigator.clipboard.writeText(codeString);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        };

                        return (
                          <div className="code-block-wrapper">
                            <div className="code-block-header">
                              <span className="code-language">{match[1]}</span>
                              <button onClick={handleCopy} className="code-copy-btn">
                                {copied ? '✅ Copied!' : '📋 Copy'}
                              </button>
                            </div>
                            <pre {...props}>
                              <code className={className}>{children}</code>
                            </pre>
                          </div>
                        );
                      }

                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.content === '' && (
          <div className="message assistant">
            <p className="message-sender"><strong>⚡️ThunderMind⚡️</strong></p>
            <div className="message-content">
              <p><em>Thinking...</em></p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={sendMessage} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask ⚡️ThunderMind⚡️ a coding question..."
        />
        <button type="submit" disabled={loading}>Send</button>
      </form>
    </main>
  );
}

App.displayName = 'App';
export default App;
