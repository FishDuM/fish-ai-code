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
          colorPrimary: '#111925',
          colorInfo: '#36D2BE',
          colorSuccess: '#10B981',
          colorWarning: '#F59E0B',
          colorError: '#EF4444',
          colorLink: '#36D2BE',
          colorTextBase: '#111925',
          colorBgBase: '#fff',
          colorBgContainer: '#fff',
          colorBgElevated: '#fff',
          colorBorder: '#DFE1E5',
          colorBorderSecondary: 'rgba(17,25,37,0.1)',
          colorSplit: 'rgba(17,25,37,0.1)',
          colorText: '#111925',
          colorTextSecondary: 'rgba(17,25,37,0.65)',
          colorTextTertiary: 'rgba(17,25,37,0.3)',
          colorTextQuaternary: 'rgba(17,25,37,0.45)',
          borderRadius: 6,
          borderRadiusLG: 8,
          fontFamily: '"Alibaba PuHuiTi 2.0", -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", Roboto, sans-serif',
          fontSize: 14,
          controlHeight: 36,
          boxShadow: '0px 4px 20px rgba(17,25,37,0.08)',
          boxShadowSecondary: '0 2px 8px rgba(0,0,0,0.08)',
        },
        components: {
          Button: {
            borderRadius: 6,
            controlHeight: 36,
            fontWeight: 500,
          },
          Card: {
            borderRadiusLG: 8,
          },
          Input: {
            borderRadius: 6,
            controlHeight: 36,
          },
          Menu: {
            itemBorderRadius: 6,
            subMenuItemBorderRadius: 6,
          },
          Table: {
            borderRadius: 8,
          },
          Modal: {
            borderRadiusLG: 12,
          },
          Select: {
            borderRadius: 6,
            controlHeight: 36,
          },
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
