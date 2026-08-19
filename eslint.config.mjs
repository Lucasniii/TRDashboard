import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...typescript,
  {
    // eslint-plugin-react's automatic version detection uses APIs removed in
    // ESLint 10, so the version is pinned explicitly here.
    settings: { react: { version: '19.2' } },
  },
]

export default eslintConfig
