/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_ENDPOINT: string
}

interface Window {
  __APP_CONFIG__?: {
    VITE_API_ENDPOINT?: string
    GOOGLE_CLIENT_ID?: string
    ADMIN_EMAIL?: string
    IMAGE_BASE_URL?: string
  }
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
