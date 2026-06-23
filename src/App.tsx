import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import DashboardPage from '@/pages/DashboardPage'
import EscalationsPage from '@/pages/EscalationsPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import PeriskopePage from '@/pages/PeriskopePage'

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/gokwik/ke-control-tower">
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<AppLayout><DashboardPage /></AppLayout>} />
        <Route path="/escalations" element={<AppLayout><EscalationsPage /></AppLayout>} />
        <Route path="/analytics" element={<AppLayout><AnalyticsPage /></AppLayout>} />
        <Route path="/periskope" element={<AppLayout><PeriskopePage /></AppLayout>} />
      </Routes>
    </BrowserRouter>
  )
}
