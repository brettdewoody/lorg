import { Route, Routes } from 'react-router-dom'

import Footer from './components/Footer'
import Header from './components/Header'
import Data from './routes/Data'
import Home from './routes/Home'
import Support from './routes/Support'

export default function App() {
  return (
    <div className="topo-bg flex min-h-screen flex-col text-retro-ink">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/data" element={<Data />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
