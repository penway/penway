import { CustomCursor } from "./CustomCursor";

const profileLinks = [
  { label: "GitHub", href: "https://github.com/penway" },
  {
    label: "Google Scholar",
    href: "https://scholar.google.com/citations?user=VYB4Cs4AAAAJ",
  },
  { label: "Email", href: "mailto:wang_pengwei@u.nus.edu" },
];

const affiliations = [
  {
    name: "Medical University of Vienna",
    href: "https://www.meduniwien.ac.at",
  },
  {
    name: "Bogunović Lab",
    href: "https://bogunovic.cynapse.at",
  },
];

export default function App() {
  return (
    <>
      <main className="page-shell">
        <aside className="profile-panel" aria-label="About Pengwei Wang">
          <div className="profile-summary">
            <h1>Pengwei Wang</h1>
            <p className="role">
              2nd-year PhD student in computer vision and medical imaging.
            </p>

            <div className="affiliations" aria-label="Affiliations">
              {affiliations.map((affiliation) => (
                <a
                  className="affiliation"
                  href={affiliation.href}
                  key={affiliation.name}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{affiliation.name}</strong>
                </a>
              ))}
            </div>
          </div>

          <nav className="profile-links" aria-label="Profile links">
            {profileLinks.map((link) => (
              <a href={link.href} key={link.label}>
                <span>{link.label}</span>
                <span className="profile-links__arrow" aria-hidden="true">↗</span>
              </a>
            ))}
          </nav>
        </aside>

        <section className="content-panel">
          <header className="intro">
            <h2>I work on explainable computer vision for medical imaging.</h2>
          </header>

          <section className="selected-work" aria-label="Current project">
            <a
              className="project-card"
              href="/projects/pixel-level-fiqa/"
              data-cursor="project"
            >
              <span className="project-card__arrow" aria-hidden="true">→</span>

              <h3>Pixel-level Fundus Image Quality Assessment</h3>
              <p className="project-card__summary">
                A collection of datasets, a pixel-level quality benchmark, and an
                explainable method grounded in retinal anatomy.
              </p>

              <ol className="project-parts">
                <li>Awesome FIQA — dataset collection</li>
                <li>FunPiQ — pixel-level benchmark</li>
                <li>EFIQA — explainable assessment method</li>
              </ol>
            </a>
          </section>
        </section>
      </main>

      <CustomCursor />
    </>
  );
}
