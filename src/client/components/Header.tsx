import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header className="border-b-4 border-black bg-retro-panel-alt/95">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-4 px-4 py-4 sm:flex-row">
        <Link
          to="/"
          className="font-display text-xl uppercase tracking-[0.4em] text-retro-sun drop-shadow-[4px_4px_0_#000] sm:text-2xl"
        >
          Lorg
        </Link>
        <nav className="flex gap-4 font-display text-[0.55rem] uppercase tracking-[0.35em] text-retro-ink/70 sm:gap-6 sm:text-[0.65rem]">
          <Link className="transition hover:text-retro-sun" to="/">Home</Link>
          <Link className="transition hover:text-retro-sun" to="/data">Data</Link>
          <Link className="transition hover:text-retro-sun" to="/support">Support</Link>
        </nav>
      </div>
    </header>
  )
}
