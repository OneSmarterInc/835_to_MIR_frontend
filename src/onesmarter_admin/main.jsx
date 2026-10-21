import React from 'react'
import ReactDOM from 'react-dom/client'
import '../utils/requestGovernor.js'
import { createCsrfFetch } from '../utils/csrfFetch.js'
import App from './App.jsx'
import './index.css'

window.fetch = createCsrfFetch(window.fetch.bind(window), {
  frontendOrigin: window.location.origin,
  backendUrl: import.meta.env.VITE_API_URL || '',
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
