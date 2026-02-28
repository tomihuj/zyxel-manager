import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import Groups from './pages/Groups'
import BulkActions from './pages/BulkActions'
import Reports from './pages/Reports'
import Users from './pages/Users'
import DeviceConfig from './pages/DeviceConfig'
import Compare from './pages/Compare'
import Backups from './pages/Backups'
import Templates from './pages/Templates'
import Logs from './pages/Logs'
import Alerts from './pages/Alerts'
import Compliance from './pages/Compliance'
import ConfigSearch from './pages/ConfigSearch'
import Metrics from './pages/Metrics'
import Topology from './pages/Topology'
import Settings from './pages/Settings'
import Firmware from './pages/Firmware'
import SecurityAdvisor from './pages/SecurityAdvisor'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="devices" element={<Devices />} />
        <Route path="devices/:id/config" element={<DeviceConfig />} />
        <Route path="groups" element={<Groups />} />
        <Route path="bulk" element={<BulkActions />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<Users />} />
        <Route path="compare" element={<Compare />} />
        <Route path="backups" element={<Backups />} />
        <Route path="templates" element={<Templates />} />
        <Route path="logs" element={<Logs />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="compliance" element={<Compliance />} />
        <Route path="config-search" element={<ConfigSearch />} />
        <Route path="metrics" element={<Metrics />} />
        <Route path="topology" element={<Topology />} />
        <Route path="settings" element={<Settings />} />
        <Route path="firmware" element={<Firmware />} />
        <Route path="security" element={<SecurityAdvisor />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
