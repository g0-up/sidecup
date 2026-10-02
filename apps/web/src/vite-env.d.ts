/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SELLER_NAME?: string;
  readonly VITE_USE_MOCK?: string;
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_PUBLIC_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
