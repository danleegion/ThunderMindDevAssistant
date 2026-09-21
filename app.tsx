import { useState, useRef, useEffect, type FormEvent, type MouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './App.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am ThunderMind. How can I help you code today?' }
  ]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Handle window dragging
  const handleMouseDown = async (e: MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      const appWindow = getCurrentWindow();
      await appWindow.startDragging();
    }
  };

  // Function to send prompt to local Ollama instance
  const sendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5-coder:7b',
          prompt: userMessage,
          stream: false
        })
      });

      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev, 
        { role: 'assistant', content: 'Error: Could not connect to local Ollama service. Is it running?' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container">
      {/* Draggable Title Bar */}
      <div onMouseDown={handleMouseDown} className="window-header">
        <span className="window-title">ThunderMind Dev Assistant</span>
      </div>

      {/* Chat Messages Log */}
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <p><strong>{msg.role === 'user' ? 'You' : 'ThunderMind'}:</strong> {msg.content}</p>
          </div>
        ))}
        {loading && <div className="message assistant"><p><em>Thinking...</em></p></div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={sendMessage} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Qwen a coding question..."
        />
        <button type="submit" disabled={loading}>Send</button>
      </form>
    </main>
  );
}

export default App;
