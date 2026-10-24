<script setup lang="ts">
import type { ToolCallAction } from "../types";
import { useActionCards } from "../composables/useActionCards";
import {
  Wrench,
  Terminal,
  Play,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-vue-next";

const props = defineProps<{
  action: ToolCallAction;
}>();

const { approveAction, rejectAction } = useActionCards();
</script>

<template>
  <div class="ds-action-card glass glass--strong" :class="action.status">
    <div class="card-header">
      <div class="tool-info">
        <component
          :is="
            action.name.includes('shell') || action.name.includes('bash')
              ? Terminal
              : Wrench
          "
          :size="14"
          class="tool-icon"
        />
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
      <button
        class="btn approve-btn glass glass--accent glass-interactive"
        @click="approveAction(action)"
      >
        <Play :size="12" />
        <span>Run Tool</span>
      </button>
      <button
        class="btn reject-btn glass glass--subtle glass-interactive"
        @click="rejectAction(action)"
      >
        <X :size="12" />
        <span>Reject</span>
      </button>
    </div>

    <div v-else-if="action.status === 'running'" class="card-status-running">
      <Loader2 :size="13" class="spinner" />
      <span>Executing tool on local bridge...</span>
    </div>

    <div v-else-if="action.status === 'completed'" class="card-result">
      <div class="result-title">
        <CheckCircle2 :size="12" class="completed-icon" />
        <span>Result:</span>
      </div>
      <pre class="result-body">{{
        typeof action.result === "object"
          ? JSON.stringify(action.result, null, 2)
          : action.result
      }}</pre>
    </div>

    <div v-else-if="action.status === 'error'" class="card-error">
      <AlertCircle :size="12" />
      <span>Error: {{ action.error }}</span>
    </div>
  </div>
</template>

<style scoped>
.ds-action-card {
  border-radius: var(--r-md, 16px);
  padding: 12px 14px;
  margin: 8px 0;
  font-family: inherit;
  color: var(--text, #edeff7);
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

.tool-icon {
  color: var(--ds-blue-400, #7c93ff);
}

.tool-name {
  font-weight: 600;
  color: #ffffff;
  font-size: 13.5px;
  letter-spacing: -0.01em;
}

.status-badge {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: var(--r-pill, 9999px);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.status-badge.pending {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
}
.status-badge.running {
  color: #facc15;
  background: rgba(234, 179, 8, 0.15);
  border: 1px solid rgba(234, 179, 8, 0.3);
}
.status-badge.completed {
  color: #4ade80;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
}
.status-badge.error {
  color: #f87171;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.card-body pre,
.card-result pre {
  background: #0e1220;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--r-sm, 10px);
  padding: 8px 10px;
  font-size: 11.5px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  max-height: 130px;
  overflow-y: auto;
  color: var(--text, #edeff7);
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: var(--r-pill, 9999px);
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
}

.approve-btn {
  background: linear-gradient(
    135deg,
    rgba(77, 107, 254, 0.9),
    rgba(58, 87, 232, 0.8)
  );
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.25);
}

.reject-btn {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted, #9aa1bc);
  border-color: rgba(255, 255, 255, 0.1);
}

.reject-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.card-status-running {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #facc15;
  font-size: 12px;
  margin-top: 8px;
}

.spinner {
  animation: spin 1s linear infinite;
}

.result-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: #4ade80;
  margin-bottom: 4px;
}

.card-error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #f87171;
  font-size: 12px;
  margin-top: 8px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
