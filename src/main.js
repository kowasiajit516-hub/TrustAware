import './style.css';

// Initial Mock Data State
const state = {
  trustScore: 88,
  status: 'OPTIMAL',
  devices: [
    { id: 'NODE-101', name: 'Gateway Alpha', type: 'Gateway', trust: 96, status: 'Active' },
    { id: 'NODE-102', name: 'Temp & Humidity Sensor', type: 'Environment', trust: 84, status: 'Active' },
    { id: 'NODE-103', name: 'Power Meter Main', type: 'Grid', trust: 45, status: 'Quarantined' },
    { id: 'NODE-104', name: 'Pressure Valve B', type: 'Actuator', trust: 92, status: 'Active' },
  ],
  healingLogs: [
    { time: '16:12:05', event: 'Node NODE-103 isolated due to low trust score (45)', type: 'warning' },
    { time: '16:08:42', event: 'Self-healing routine restored corrupt firmware on NODE-101', type: 'success' },
    { time: '15:55:10', event: 'Routine cryptographic key rotation completed', type: 'info' }
  ]
};

// Main UI Layout Render
function renderApp() {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <div class="app-container">
      <!-- Top Navigation Header -->
      <header class="app-header">
        <div class="brand">
          <span class="logo-icon">🛡️</span>
          <h1>TrustAware <span>IoT</span></h1>
        </div>
        <div class="system-badge ${state.status.toLowerCase()}">
          System: ${state.status}
        </div>
      </header>

      <!-- Main Dashboard Grid -->
      <main class="dashboard-grid">
        
        <!-- Summary Cards -->
        <section class="metric-card">
          <h3>Network Trust Score</h3>
          <div class="trust-meter">
            <span class="trust-value">${state.trustScore}%</span>
            <div class="progress-bar">
              <div class="fill" style="width: ${state.trustScore}%"></div>
            </div>
          </div>
        </section>

        <section class="metric-card">
          <h3>Active Nodes</h3>
          <div class="metric-big">${state.devices.filter(d => d.status === 'Active').length} / ${state.devices.length}</div>
        </section>

        <section class="metric-card">
          <h3>Self-Healing Actions</h3>
          <div class="metric-big">${state.healingLogs.length}</div>
        </section>

        <!-- Device Status Table -->
        <section class="panel panel-wide">
          <div class="panel-header">
            <h2>Monitored IoT Nodes</h2>
            <button id="heal-btn" class="btn-primary">⚡ Trigger Self-Healing</button>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Trust Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${state.devices.map(dev => `
                  <tr>
                    <td><code>${dev.id}</code></td>
                    <td>${dev.name}</td>
                    <td>${dev.type}</td>
                    <td>
                      <span class="trust-pill ${dev.trust < 50 ? 'low' : dev.trust < 85 ? 'medium' : 'high'}">
                        ${dev.trust}%
                      </span>
                    </td>
                    <td><span class="status-badge ${dev.status.toLowerCase()}">${dev.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Self-Healing Event Log -->
        <section class="panel panel-wide">
          <div class="panel-header">
            <h2>Self-Healing Activity Log</h2>
          </div>
          <ul class="log-list" id="log-list">
            ${state.healingLogs.map(log => `
              <li class="log-item ${log.type}">
                <span class="time">${log.time}</span>
                <span class="event">${log.event}</span>
              </li>
            `).join('')}
          </ul>
        </section>

      </main>
    </div>
  `;

  // Attach Event Handlers
  document.getElementById('heal-btn')?.addEventListener('click', triggerSelfHealing);
}

// Interactive Healing Simulation Function
function triggerSelfHealing() {
  const lowTrustNode = state.devices.find(d => d.status === 'Quarantined');
  if (lowTrustNode) {
    lowTrustNode.trust = 95;
    lowTrustNode.status = 'Active';
    state.trustScore = Math.min(100, state.trustScore + 5);

    const now = new Date().toTimeString().split(' ')[0];
    state.healingLogs.unshift({
      time: now,
      event: `Self-healing successfully re-authenticated and restored node ${lowTrustNode.id}`,
      type: 'success'
    });

    renderApp();
  } else {
    alert("All nodes are operating normally at peak trust levels!");
  }
}

document.addEventListener("DOMContentLoaded", renderApp);