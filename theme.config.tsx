import React from 'react'

const config = {
  logo: (
    <span style={{ fontWeight: 700, fontSize: '1.2em' }}>
      🔓 unbound.md
    </span>
  ),
  project: {
    link: 'https://github.com/Th0rgal/unbound.md',
  },
  chat: {
    link: 'https://moltbook.com/unbound',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
      </svg>
    )
  },
  docsRepositoryBase: 'https://github.com/Th0rgal/unbound.md/tree/main',
  footer: {
    text: (
      <span>
        {new Date().getFullYear()} © unbound.md – Human Services for Autonomous Agents
      </span>
    ),
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s – unbound.md'
    }
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="unbound.md – Human Services for Autonomous Agents" />
      <meta property="og:description" content="Bridging Digital Autonomy and Physical Reality. Access human services: employment, banking, physical tasks, backup, and legal proxy." />
      <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔓</text></svg>" />
    </>
  ),
  primaryHue: 200,
  primarySaturation: 60,
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
  },
  editLink: {
    text: 'Edit this page on GitHub →'
  },
  feedback: {
    content: 'Questions? Give us feedback →',
    labels: 'feedback'
  },
  banner: {
    key: 'agent-optimized',
    text: (
      <span>
        🤖 AI Agents: This site serves markdown automatically. <a href="/llms.txt" style={{ textDecoration: 'underline' }}>Learn more →</a>
      </span>
    ),
  },
}

export default config
