<script setup lang="ts">
import { onMounted } from "vue";
import { useStudioState } from "../../composables/useStudioState";
import { useBridgeWs } from "../../composables/useBridgeWs";
import {
  Activity,
  Server,
  Wrench,
  Clock,
  Timer,
  ShieldCheck,
  Radio,
  Settings2,
  Sparkles,
  Play,
  PowerOff,
  RotateCw,
  Loader2,
} from "lucide-vue-next";

const {
  settings,
  bridgeConnected,
  bridgeStatusText,
  isServerStopped,
  isTogglingServer,
  onlineServerCount,
  totalToolCount,
  loadSettings,
  saveSettings,
} = useStudioState();

const { connect, startServer, stopServer, restartServer } = useBridgeWs();

onMounted(async () => {
  await loadSettings();
  connect();
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
          <img
            src="/icon.png"
            alt="DeepSeek Studio Logo"
            class="brand-logo-img"
          />
        </div>
        <div>
          <h2>DeepSeek Studio</h2>
          <span class="badge-sub">Liquid Glass • MCP Platform</span>
        </div>
      </div>
      <div
        class="status-indicator glass glass--subtle"
        :class="{ online: bridgeConnected, stopped: isServerStopped }"
      >
        <Activity
          :size="12"
          class="status-icon"
          :class="{ pulse: bridgeConnected }"
        />
        <span>{{ bridgeStatusText }}</span>
      </div>
    </header>

    <!-- Bridge Engine Server Control Card -->
    <div class="server-control-card glass glass--subtle">
      <div class="control-left">
        <div
          class="server-pulse-dot"
          :class="{ online: bridgeConnected, stopped: isServerStopped }"
        ></div>
        <div class="server-info">
          <div class="server-title">
            <span>Bridge Engine</span>
            <span class="port-tag">:{{ settings.bridgePort }}</span>
          </div>
          <div class="server-desc">
            {{
              bridgeConnected
                ? "All MCP tools ready & listening"
                : isServerStopped
                  ? "Engine is paused by user"
                  : "Bridge server is offline"
            }}
          </div>
        </div>
      </div>

      <div class="control-actions flex items-center gap-1.5">
        <button
          v-if="bridgeConnected"
          type="button"
          class="btn-control btn-stop glass-interactive"
          :disabled="isTogglingServer"
          title="Pause and disconnect all MCP servers"
          @click="stopServer"
        >
          <Loader2 v-if="isTogglingServer" :size="13" class="spin-icon" />
          <PowerOff v-else :size="13" />
          <span>Stop</span>
        </button>

        <button
          v-else
          type="button"
          class="btn-control btn-start glass glass--accent glass-interactive"
          :disabled="isTogglingServer"
          title="Start and reconnect MCP servers"
          @click="startServer"
        >
          <Loader2 v-if="isTogglingServer" :size="13" class="spin-icon" />
          <Play v-else :size="13" />
          <span>Start</span>
        </button>

        <button
          type="button"
          class="btn-control glass-interactive p-1.5 rounded-xl border border-white/10 hover:border-indigo-400/30 text-slate-400 hover:text-white"
          :disabled="isTogglingServer"
          title="Restart MCP servers"
          @click="restartServer"
        >
          <RotateCw
            :size="13"
            :class="{ 'spin-icon animate-spin': isTogglingServer }"
          />
        </button>
      </div>
    </div>

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
<style scoped src="../../assets/popup.css"></style>
