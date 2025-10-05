import { Route, Routes } from 'react-router-dom'

import Footer from './components/Footer'
import Header from './components/Header'
import Map from './routes/Map'
import Dashboard from './routes/Dashboard'
import Home from './routes/Home'
import Support from './routes/Support'

export default function App() {
  return (
    <div className="topo-bg flex min-h-screen flex-col text-retro-ink">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/map" element={<Map />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
