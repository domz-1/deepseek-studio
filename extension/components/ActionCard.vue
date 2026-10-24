<script setup lang="ts">
import type { ToolCallAction } from "../types";
import { useActionCards } from "../composables/useActionCards";

const props = defineProps<{
  action: ToolCallAction;
}>();

const { approveAction, rejectAction } = useActionCards();
</script>

<template>
  <div class="ds-action-card" :class="action.status">
    <div class="card-header">
      <div class="tool-info">
        <span class="tool-icon">🛠️</span>
        <span class="tool-name">{{ action.name }}</span>
        <span class="status-badge" :class="action.status">{{
          action.status
        }}</span>
      </div>
    </div>

    <div class="card-body">
      <pre class="args-view">{{
        JSON.stringify(action.arguments, null, 2)
      }}</pre>
    </div>

    <div v-if="action.status === 'pending'" class="card-actions">
      <button class="btn approve-btn" @click="approveAction(action)">
        ✓ Run Tool
      </button>
      <button class="btn reject-btn" @click="rejectAction(action)">
        ✕ Reject
      </button>
    </div>

    <div v-else-if="action.status === 'running'" class="card-status-running">
      <span class="spinner"></span> Executing tool on bridge...
    </div>

    <div v-else-if="action.status === 'completed'" class="card-result">
      <div class="result-title">Result:</div>
      <pre class="result-body">{{
        typeof action.result === "object"
          ? JSON.stringify(action.result, null, 2)
          : action.result
      }}</pre>
    </div>

    <div v-else-if="action.status === 'error'" class="card-error">
      ✕ Error: {{ action.error }}
    </div>
  </div>
</template>

<style scoped>
.ds-action-card {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 12px;
  margin: 10px 0;
  font-family: inherit;
  color: #e2e8f0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.ds-action-card.pending {
  border-color: rgba(59, 130, 246, 0.5);
}

.ds-action-card.running {
  border-color: rgba(234, 179, 8, 0.5);
}

.ds-action-card.completed {
  border-color: rgba(34, 197, 94, 0.5);
}

.ds-action-card.error {
  border-color: rgba(239, 68, 68, 0.5);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-name {
  font-weight: 600;
  color: #60a5fa;
  font-size: 13.5px;
}

.status-badge {
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 6px;
  text-transform: uppercase;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}

.status-badge.pending {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.15);
}
.status-badge.running {
  color: #facc15;
  background: rgba(234, 179, 8, 0.15);
}
.status-badge.completed {
  color: #4ade80;
  background: rgba(34, 197, 94, 0.15);
}
.status-badge.error {
  color: #f87171;
  background: rgba(239, 68, 68, 0.15);
}

.card-body pre,
.card-result pre {
  background: #020617;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
  max-height: 140px;
  overflow-y: auto;
  color: #cbd5e1;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.btn {
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn:hover {
  opacity: 0.9;
}

.approve-btn {
  background: #2563eb;
  color: #fff;
}

.reject-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
}

.card-status-running {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #facc15;
  font-size: 12.5px;
  margin-top: 8px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(250, 204, 21, 0.3);
  border-top-color: #facc15;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.card-error {
  color: #f87171;
  font-size: 12.5px;
  margin-top: 8px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
