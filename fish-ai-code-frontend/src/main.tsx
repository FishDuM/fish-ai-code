import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { router } from './router'
import { useAuthStore } from './stores/useAuthStore'
import { ErrorBoundary } from './components/ErrorBoundary'
import './global.css'

// Validate session on app load
useAuthStore.getState().fetchLoginUser()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
        },
      }}
    >
      <AntApp>
        <ErrorBoundary>
          <RouterProvider router={router} />
        </ErrorBoundary>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
