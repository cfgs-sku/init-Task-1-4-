// OrderStatusTag.js — 订单状态标签统一渲染组件
// 根据 status 字段动态输出对应颜色/文字的 HTML 字符串
// ════════════════════════════════════════════════════════════════

var OrderStatusTag = (function () {
  'use strict';

  // 状态配置表：{ label, colorClass, emoji }
  var STATUS_MAP = {
    pending_review: { label: '待审核', cls: 'ost-yellow', emoji: '🟡' },
    purchasing:     { label: '采购中', cls: 'ost-blue',   emoji: '🔵' },
    received:       { label: '已收货', cls: 'ost-green',  emoji: '🟢' },
    archived:       { label: '已归档', cls: 'ost-gray',   emoji: '⚫' },
    rejected:       { label: '已驳回', cls: 'ost-red',    emoji: '🔴' },
  };

  // 临时 SKU 转正状态
  var TEMP_STATUS_MAP = {
    pending:  { label: '待转正', cls: 'ost-yellow', emoji: '🟡' },
    approved: { label: '已转正', cls: 'ost-green',  emoji: '🟢' },
    rejected: { label: '已驳回', cls: 'ost-red',    emoji: '🔴' },
  };

  return {
    /**
     * 渲染订单状态标签 HTML
     * @param {string} status
     * @returns {string} HTML string
     */
    render: function (status) {
      var cfg = STATUS_MAP[status] || { label: status, cls: 'ost-gray', emoji: '⚪' };
      return '<span class="ost-tag ' + cfg.cls + '">' + cfg.emoji + ' ' + cfg.label + '</span>';
    },

    /**
     * 渲染临时 SKU 状态标签
     */
    renderTemp: function (status) {
      var cfg = TEMP_STATUS_MAP[status] || { label: status, cls: 'ost-gray', emoji: '⚪' };
      return '<span class="ost-tag ' + cfg.cls + '">' + cfg.emoji + ' ' + cfg.label + '</span>';
    },

    /**
     * 渲染临时非标标记（用于购物车行）
     * @param {boolean} isTemp
     */
    tempBadge: function (isTemp) {
      if (!isTemp) return '';
      return '<span class="ost-temp-badge">🟡 临时非标</span>';
    },

    /** 获取当前状态可执行的操作按钮列表 */
    getActions: function (status, userRole) {
      var actions = [];
      if (status === 'pending_review' && userRole === 'hmq') {
        actions.push({ action: 'approve', label: '✅ 通过', cls: 'btn-green' });
        actions.push({ action: 'reject',  label: '❌ 驳回', cls: 'btn-red',  needReason: true });
      }
      if (status === 'purchasing') {
        actions.push({ action: 'receive', label: '📦 确认收货', cls: 'btn-blue' });
      }
      if (status === 'received' && userRole === 'hmq') {
        actions.push({ action: 'archive', label: '🗂 归档', cls: 'btn-gray' });
      }
      if (status === 'rejected' && userRole === 'buyer') {
        actions.push({ action: 'resubmit', label: '🔄 重新提交', cls: 'btn-amber' });
      }
      return actions;
    },

    /** CSS 样式字符串（注入 <style> 标签） */
    css: [
      '.ost-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap}',
      '.ost-yellow{background:#FEF6E2;color:#7A5200;border:1px solid #EAC860}',
      '.ost-blue  {background:#EBF3FC;color:#1A5FA8;border:1px solid #C8DFF8}',
      '.ost-green {background:#E8F5EB;color:#267339;border:1px solid #A0D4AC}',
      '.ost-gray  {background:#F3F4F6;color:#6B7280;border:1px solid #D1D5DB}',
      '.ost-red   {background:#FEF0EE;color:#9E251C;border:1px solid #FECACA}',
      '.ost-temp-badge{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600;background:#FEF6E2;color:#7A5200;border:1px solid #EAC860}',
    ].join('\n')
  };
})();
