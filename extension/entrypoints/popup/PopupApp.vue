<script setup lang="ts">
import { onMounted } from 'vue';
import { useStudioState } from '../../composables/useStudioState';

const { settings, bridgeConnected, bridgeStatusText, onlineServerCount, totalToolCount, loadSettings, saveSettings } =
  useStudioState();

onMounted(async () => {
  await loadSettings();
});

function toggleAutoApprove() {
  saveSettings({ autoApprove: !settings.autoApprove });
}

function toggleAutoContinue() {
  saveSettings({ autoContinue: !settings.autoContinue });
}

function updatePort(e: Event) {
  const val = Number((e.target as HTMLInputElement).value);
  if (val > 0) saveSettings({ bridgePort: val });
}

function updateDelay(e: Event) {
  const val = Number((e.target as HTMLInputElement).value);
  if (val >= 1) saveSettings({ autoContinueDelay: val });
}
</script>

<template>
  <div class="popup-container">
    <header class="popup-header">
      <div class="logo-area">
        <span class="logo-icon">⚡</span>
        <div>
          <h2>DeepSeek Studio</h2>
          <span class="badge-vue">Vue 3 Edition</span>
        </div>
      </div>
      <div class="status-indicator" :class="{ online: bridgeConnected }">
        <span class="dot"></span>
        <span>{{ bridgeStatusText }}</span>
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ onlineServerCount }}</div>
        <div class="stat-label">Online Servers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalToolCount }}</div>
        <div class="stat-label">Total Tools</div>
      </div>
    </div>

    <div class="settings-list">
      <div class="setting-item">
        <div class="setting-info">
          <label>Auto-Continue Watchdog</label>
          <span class="desc">Automatically click Continue/Retry when generation halts</span>
        </div>
        <input type="checkbox" :checked="settings.autoContinue" @change="toggleAutoContinue" />
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Watchdog Delay (Seconds)</label>
          <span class="desc">Cooldown before auto-clicking</span>
        </div>
        <input
          type="number"
          min="1"
          max="60"
          class="num-input"
          :value="settings.autoContinueDelay"
          @change="updateDelay"
        />
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Auto-Approve Tool Calls</label>
          <span class="desc">Run MCP tools immediately without manual card approval</span>
        </div>
        <input type="checkbox" :checked="settings.autoApprove" @change="toggleAutoApprove" />
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <label>Bridge Server Port</label>
          <span class="desc">Local WebSocket bridge port (Default: 8080 / 8088)</span>
        </div>
        <input
          type="number"
          class="num-input"
          :value="settings.bridgePort"
          @change="updatePort"
        />
      </div>
    </div>

    <footer class="popup-footer">
      <span>Connected to local MCP bridge</span>
    </footer>
  </div>
</template>

<style scoped>
.popup-container {
  width: 340px;
  background: #0f172a;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 16px;
  user-select: none;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 12px;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 20px;
}

h2 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: #f8fafc;
}

.badge-vue {
  font-size: 10px;
  color: #4ade80;
  font-weight: 500;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: #ef4444;
  font-weight: 500;
}

.status-indicator.online {
  color: #4ade80;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.stat-card {
  background: #1e293b;
  border-radius: 8px;
  padding: 10px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #60a5fa;
}

.stat-label {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.setting-info label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #e2e8f0;
}

.setting-info .desc {
  display: block;
  font-size: 10.5px;
  color: #64748b;
  margin-top: 1px;
}

.num-input {
  width: 60px;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
  text-align: center;
}

input[type="checkbox"] {
  cursor: pointer;
  accent-color: #3b82f6;
  width: 16px;
  height: 16px;
}

.popup-footer {
  margin-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 10px;
  text-align: center;
  font-size: 10.5px;
  color: #64748b;
}
</style>
