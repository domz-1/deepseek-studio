<script setup lang="ts">
import { onMounted } from "vue";
import { useStudioState } from "../../composables/useStudioState";
import {
  Zap,
  Activity,
  Server,
  Wrench,
  Clock,
  Timer,
  ShieldCheck,
  Radio,
  Settings2,
  Sparkles,
} from "lucide-vue-next";

const {
  settings,
  bridgeConnected,
  bridgeStatusText,
  onlineServerCount,
  totalToolCount,
  loadSettings,
  saveSettings,
} = useStudioState();

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
  <div class="popup-container glass glass--strong">
    <!-- Header -->
    <header class="popup-header">
      <div class="logo-area">
        <div class="logo-icon-wrapper glass glass--accent">
          <Zap :size="16" />
        </div>
        <div>
          <h2>DeepSeek Studio</h2>
          <span class="badge-sub">Vue 3 • Liquid Glass</span>
        </div>
      </div>
      <div
        class="status-indicator glass glass--subtle"
        :class="{ online: bridgeConnected }"
      >
        <Activity
          :size="12"
          class="status-icon"
          :class="{ pulse: bridgeConnected }"
        />
        <span>{{ bridgeStatusText }}</span>
      </div>
    </header>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card glass glass--subtle">
        <div class="stat-icon-wrapper">
          <Server :size="15" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ onlineServerCount }}</span>
          <span class="stat-label">Online Servers</span>
        </div>
      </div>

      <div class="stat-card glass glass--subtle">
        <div class="stat-icon-wrapper">
          <Wrench :size="15" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ totalToolCount }}</span>
          <span class="stat-label">Total Tools</span>
        </div>
      </div>
    </div>

    <!-- Section Title -->
    <div class="section-title">
      <Settings2 :size="13" />
      <span>STUDIO PREFERENCES</span>
    </div>

    <!-- Settings List -->
    <div class="settings-list">
      <!-- Auto Continue -->
      <div class="setting-item glass glass--subtle">
        <div class="setting-icon">
          <Clock :size="16" />
        </div>
        <div class="setting-info">
          <label>Auto-Continue Watchdog</label>
          <span class="desc"
            >Auto-click Continue/Retry when generation halts</span
          >
        </div>
        <button
          type="button"
          role="switch"
          class="switch-toggle"
          :class="{ active: settings.autoContinue }"
          :aria-checked="settings.autoContinue"
          @click="toggleAutoContinue"
        >
          <span class="switch-thumb"></span>
        </button>
      </div>

      <!-- Watchdog Delay -->
      <div class="setting-item glass glass--subtle">
        <div class="setting-icon">
          <Timer :size="16" />
        </div>
        <div class="setting-info">
          <label>Watchdog Delay</label>
          <span class="desc">Cooldown before auto-triggering (seconds)</span>
        </div>
        <input
          type="number"
          min="1"
          max="60"
          class="num-input glass"
          :value="settings.autoContinueDelay"
          @change="updateDelay"
        />
      </div>

      <!-- Auto Approve -->
      <div class="setting-item glass glass--subtle">
        <div class="setting-icon">
          <ShieldCheck :size="16" />
        </div>
        <div class="setting-info">
          <label>Auto-Approve Tool Calls</label>
          <span class="desc">Execute actions without manual card prompt</span>
        </div>
        <button
          type="button"
          role="switch"
          class="switch-toggle"
          :class="{ active: settings.autoApprove }"
          :aria-checked="settings.autoApprove"
          @click="toggleAutoApprove"
        >
          <span class="switch-thumb"></span>
        </button>
      </div>

      <!-- Bridge Server Port -->
      <div class="setting-item glass glass--subtle">
        <div class="setting-icon">
          <Radio :size="16" />
        </div>
        <div class="setting-info">
          <label>Bridge Server Port</label>
          <span class="desc">Local WebSocket port (Default: 43210)</span>
        </div>
        <input
          type="number"
          class="num-input glass"
          :value="settings.bridgePort"
          @change="updatePort"
        />
      </div>
    </div>

    <!-- Footer -->
    <footer class="popup-footer">
      <Sparkles :size="12" class="sparkle-icon" />
      <span>DeepSeek Studio • ws://127.0.0.1:{{ settings.bridgePort }}</span>
    </footer>
  </div>
</template>

<style scoped>
.popup-container {
  width: 350px;
  box-sizing: border-box;
  padding: 16px;
  color: var(--text, #edeff7);
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  border-radius: var(--r-md, 16px);
  user-select: none;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

h2 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text, #edeff7);
  letter-spacing: -0.2px;
}

.badge-sub {
  font-size: 10.5px;
  color: var(--ds-blue-400, #7c93ff);
  font-weight: 500;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 4px 9px;
  border-radius: var(--r-pill, 9999px);
  color: #ef4444;
  font-weight: 500;
}

.status-indicator.online {
  color: #4ade80;
}

.pulse {
  animation: pulse-glow 2s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%,
  100% {
    opacity: 0.8;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--r-sm, 10px);
}

.stat-icon-wrapper {
  color: var(--ds-blue-400, #7c93ff);
  display: flex;
  align-items: center;
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--text, #edeff7);
  line-height: 1.1;
}

.stat-label {
  font-size: 10.5px;
  color: var(--text-muted, #9aa1bc);
  margin-top: 2px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.6px;
  color: var(--text-muted, #9aa1bc);
  margin-bottom: 10px;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--r-sm, 10px);
}

.setting-icon {
  color: var(--ds-blue-400, #7c93ff);
  display: flex;
  align-items: center;
}

.setting-info {
  flex: 1;
}

.setting-info label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text, #edeff7);
}

.setting-info .desc {
  display: block;
  font-size: 10px;
  color: var(--text-muted, #9aa1bc);
  margin-top: 1px;
}

/* Apple / shadcn style toggle switch */
.switch-toggle {
  width: 36px;
  height: 20px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  position: relative;
  cursor: pointer;
  outline: none;
  transition:
    background-color 200ms var(--ease, ease),
    border-color 200ms var(--ease, ease);
  padding: 0;
}

.switch-toggle.active {
  background: var(--ds-blue-500, #4d6bfe);
  border-color: var(--ds-blue-400, #7c93ff);
}

.switch-thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 200ms var(--ease, ease);
}

.switch-toggle.active .switch-thumb {
  transform: translateX(16px);
}

.num-input {
  width: 54px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
  color: var(--text, #edeff7);
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
  font-family: inherit;
  text-align: center;
  outline: none;
}

.num-input:focus {
  border-color: var(--ds-blue-500, #4d6bfe);
}

.popup-footer {
  margin-top: 14px;
  border-top: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  padding-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 10px;
  color: var(--text-muted, #9aa1bc);
}

.sparkle-icon {
  color: var(--ds-blue-400, #7c93ff);
}
</style>
