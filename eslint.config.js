import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'classroom-app/release']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // 교실 컴퓨터용 프로그램 (Electron): main·preload 는 Node(CommonJS), setup.js 는 창 안의 스크립트
  {
    files: ['classroom-app/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['classroom-app/setup.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  // Vercel 서버 기능 (교실 채팅 휴대폰 알림 보내기): Node
  {
    files: ['api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  // 휴대폰 알림을 받는 서비스 워커
  {
    files: ['public/push-sw.js'],
    languageOptions: { sourceType: 'script', globals: globals.serviceworker },
  },
])
