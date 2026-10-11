import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import Sidebar from "./components/Sidebar.jsx";

import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import ForgotPassword from "./pages/auth/ForgotPassword.jsx";
import ResetPassword from "./pages/auth/ResetPassword.jsx";

import Overview from "./pages/Overview.jsx";
import Sensors from "./pages/Sensors.jsx";
import SensorManagement from "./pages/SensorManagement.jsx";
import Actuators from "./pages/Actuators.jsx";
import ActuatorManagement from "./pages/ActuatorManagement.jsx";
import Automation from "./pages/Automation.jsx";
import SelfHealing from "./pages/SelfHealing.jsx";
import FaultHistory from "./pages/FaultHistory.jsx";
import ActuatorHistory from "./pages/ActuatorHistory.jsx";
import Nodes from "./pages/Nodes.jsx";
import Settings from "./pages/Settings.jsx";

// Lazy-loaded: Charts.jsx pulls in Plotly (a real 3D WebGL library),
// which is heavy. Splitting it into its own chunk means that weight
// is only downloaded when someone actually visits Charts & Graphs,
// not on initial app load / login.
const Charts = lazy(() => import("./pages/Charts.jsx"));

function DashboardShell({ children }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

function Protected({ children }) {
  return (
    <ProtectedRoute>
      <DashboardShell>{children}</DashboardShell>
    </ProtectedRoute>
  );
}

function ChartsLoadingFallback() {
  return (
    <div className="p-6 flex items-center justify-center h-64 text-sm text-[#94A3B8]">
      Loading charts…
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Auth (public) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Dashboard (protected) */}
        <Route path="/" element={<Protected><Overview /></Protected>} />
        <Route path="/sensors" element={<Protected><Sensors /></Protected>} />
        <Route path="/sensors/new" element={<Protected><SensorManagement /></Protected>} />
        <Route path="/sensors/:sensorId/edit" element={<Protected><SensorManagement /></Protected>} />
        <Route path="/actuators" element={<Protected><Actuators /></Protected>} />
        <Route path="/actuators/new" element={<Protected><ActuatorManagement /></Protected>} />
        <Route path="/actuators/:actuatorId/edit" element={<Protected><ActuatorManagement /></Protected>} />
        <Route path="/automation" element={<Protected><Automation /></Protected>} />
        <Route path="/self-healing" element={<Protected><SelfHealing /></Protected>} />
        <Route path="/fault-history" element={<Protected><FaultHistory /></Protected>} />
        <Route path="/actuator-history" element={<Protected><ActuatorHistory /></Protected>} />
        <Route
          path="/charts"
          element={
            <Protected>
              <Suspense fallback={<ChartsLoadingFallback />}>
                <Charts />
              </Suspense>
            </Protected>
          }
        />
        <Route path="/sensor-health" element={<Protected><SelfHealing /></Protected>} />
        <Route path="/nodes" element={<Protected><Nodes /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
      </Routes>
    </AuthProvider>
  );
}
