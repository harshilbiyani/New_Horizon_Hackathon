import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode removed: it double-invokes useEffect in dev which causes
// Socket.IO to connect → cleanup → connect → creating the flashing
// "disconnected/connected" loop visible in the dashboard header.
createRoot(document.getElementById('root')!).render(
  <App />
)
