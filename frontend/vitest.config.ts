import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// ponytail: minimal Vitest config for React component tests using happy-dom
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/components/**/*.test.tsx', 'tests/integration/**/*.test.tsx'],
  },
})
