import { defineConfig } from 'orval';

// Đọc hợp đồng trong cùng repo: vintrip/be và vintrip/ai (trước đây là 2 repo đặt cạnh).
// Sinh hook TanStack Query + type vào src/generated/. File sinh ra có commit; không sửa tay.
const output = (name: string) => ({
  mode: 'tags-split' as const,
  target: `src/generated/${name}`,
  schemas: `src/generated/${name}/model`,
  client: 'react-query' as const,
  httpClient: 'fetch' as const,
  clean: true,
  override: {
    mutator: { path: 'src/http.ts', name: 'http' },
  },
});

export default defineConfig({
  coreApi: {
    input: { target: '../../../be/contracts/openapi/core-api.json' },
    output: output('core-api'),
  },
  aiService: {
    input: { target: '../../../ai/contracts/openapi/ai-service.json' },
    output: output('ai-service'),
  },
});
