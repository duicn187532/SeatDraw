import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// import './index.css' // 如果你用 CDN，就不需要这行

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
