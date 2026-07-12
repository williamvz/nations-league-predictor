import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// service worker for web push (requires a secure context — HTTPS or ingress)
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
