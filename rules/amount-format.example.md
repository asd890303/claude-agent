---
paths:
  - 'apps/uau/*/src/api/types/**'
  - 'packages/ui/src/components/AmountInput/**'
  - 'packages/core/src/format/**'
---

# 金額處理

金額一律用共用元件，勿各頁自寫格式化或運算：

- 顯示：`@core` 的 `formatCurrency`（表格金額欄都要 `render: (v) => formatCurrency(v)`）
