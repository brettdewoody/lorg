export default function Support() {
  return (
    <div className="px-3 py-6 sm:px-6 lg:px-10">
      <div className="main-shell">
        <section className="space-y-6">
          <HeaderBlock
            title="Support"
            subtitle="Questions, feedback, or bug reports—let us know."
          />
          <p className="text-sm text-retro-ink/80">
            Fill out the form and we&apos;ll get back to you as soon as possible. Include your athlete profile if it helps us investigate.
          </p>
          <form
            name="support"
            method="POST"
            data-netlify="true"
            netlify-honeypot="bot-field"
            className="space-y-5"
          >
            <input type="hidden" name="form-name" value="support" />
            <p className="hidden">
              <label>
                Don’t fill this out: <input name="bot-field" />
              </label>
            </p>
            <Field label="Name" name="name" autoComplete="name" required />
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field label="Athlete profile (optional)" name="profile" placeholder="https://www.strava.com/athletes/..." />
            <FieldTextarea label="How can we help?" name="message" rows={6} required />
            <button type="submit" className="btn">Send message</button>
          </form>
        </section>
      </div>
    </div>
  )
}

type HeaderBlockProps = {
  title: string
  subtitle: string
}

function HeaderBlock({ title, subtitle }: HeaderBlockProps) {
  return (
    <header className="space-y-2">
      <h2 className="font-display text-xl uppercase tracking-[0.35em] text-retro-sun sm:text-2xl">
        {title}
      </h2>
      <p className="text-sm text-retro-ink/70 sm:text-base">{subtitle}</p>
    </header>
  )
}

type FieldProps = {
  label: string
  name: string
  type?: string
  autoComplete?: string
  required?: boolean
  placeholder?: string
}

function Field({ label, name, type = 'text', autoComplete, required, placeholder }: FieldProps) {
  return (
    <label className="block text-sm text-retro-ink/80">
      <span className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-retro-sun">{label}</span>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        className="w-full rounded border-2 border-retro-sun/40 bg-retro-panel/70 px-4 py-2 text-retro-ink placeholder:text-retro-ink/40 focus:border-retro-sun focus:outline-none"
      />
    </label>
  )
}

type FieldTextareaProps = {
  label: string
  name: string
  rows?: number
  required?: boolean
  placeholder?: string
}

function FieldTextarea({ label, name, rows = 4, required, placeholder }: FieldTextareaProps) {
  return (
    <label className="block text-sm text-retro-ink/80">
      <span className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-retro-sun">{label}</span>
      <textarea
        id={name}
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        className="w-full rounded border-2 border-retro-sun/40 bg-retro-panel/70 px-4 py-2 text-retro-ink placeholder:text-retro-ink/40 focus:border-retro-sun focus:outline-none"
      />
    </label>
  )
}
