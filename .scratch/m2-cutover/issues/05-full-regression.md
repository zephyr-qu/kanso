# 05 — 全量回归与交付

**What to build:** 全部测试在真后端模式下全绿（tsc / vitest / Playwright 改用真后端密钥）；mock 开关回退验证（`VITE_USE_MOCK=true` 仍可用）；视觉对比脚本在真后端下重跑无回归。产出最终交付报告。

**Blocked by:** 03 — 新功能页在真后端, 04 — 双窗口 WS 实时验证

**Status:** done

- [x] tsc / vitest / Playwright 在真后端模式全绿——tsc 0 错误、vitest 43 ✓、Go 49 ✓、Playwright 39 ✓（8/11）
- [x] mock 开关回退可用（可显式开启）——mock 模式 3 项基础测试复验通过；seed.ts 检测 `VITE_USE_MOCK=true` 跳过重置
- [x] 视觉对比在真后端下无回归——8 项通过；board 关键尺寸 colW 280=280、cardH 115=115（colH 差异为静态 100vh vs 动态 flex 布局固有差异，非回归）
- [x] 交付报告：全页面真后端可用 + 双窗口 WS 通过——见 `.scratch/m2-cutover/report.md`
