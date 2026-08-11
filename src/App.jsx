import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import PropertyReport from './pages/PropertyReport'
import AdminProperties from './pages/admin/AdminProperties'
import AdminImport from './pages/admin/AdminImport'
import AdminGlobalDashboard from './pages/admin/AdminGlobalDashboard'

function Home() {
  const { isAdmin } = useAuth()
  return isAdmin ? <AdminGlobalDashboard /> : <PropertyReport />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Home />} />
            <Route path="/mot-de-passe" element={<ChangePassword />} />
            <Route path="/bien/:propertyId" element={<PropertyReport />} />
            <Route
              path="/admin/biens"
              element={<ProtectedRoute adminOnly><AdminProperties /></ProtectedRoute>}
            />
            <Route
              path="/admin/import"
              element={<ProtectedRoute adminOnly><AdminImport /></ProtectedRoute>}
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
