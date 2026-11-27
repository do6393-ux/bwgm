import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { DialogProvider } from '@/components/ui/DialogProvider'

// manifest 가 생겨서 안드로이드 Chrome 이 학생에게도 "앱 설치" 띠를 저절로 띄울 수 있다 → 띄우지 않는다.
// (필요한 선생님은 브라우저 메뉴의 "홈 화면에 추가"로 직접 한다)
window.addEventListener('beforeinstallprompt', (event) => event.preventDefault())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </StrictMode>,
)
