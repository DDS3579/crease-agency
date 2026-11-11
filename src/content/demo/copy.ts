// DEMO DATA: replace before launch
export const copy = {
  hero: {
    headline: ['Every', 'website', 'starts', 'flat.'],
    support:
      'Crease is a web studio in Valencia. We shape websites from the first blank page to launch.',
    primaryCta: 'See the process',
    secondaryCta: 'Start a project',
    dataStrip: '{stages} stages / {services} services / {projects} projects'
  },
  nav: {
    links: [
      { label: 'Process', href: '#process' },
      { label: 'Services', href: '#services' },
      { label: 'Work', href: '#work' },
      { label: 'Contact', href: '#contact' }
    ],
    cta: 'Start a project'
  },
  chapters: [
    {
      id: 'process',
      key: 'strategy',
      name: 'Strategy',
      heading: 'Find the first crease.',
      body: 'Before anything is drawn, we decide what the site is for. One decision, made early, shapes everything after it.'
    },
    {
      id: 'design',
      key: 'design',
      name: 'Design',
      heading: 'Fold it into form.',
      body: 'Structure, type and motion are shaped together, as one material, until the page has a shape of its own.'
    },
    {
      id: 'build',
      key: 'build',
      name: 'Build',
      heading: 'Make it stand up.',
      body: 'Fast, accessible and easy to edit. The flat page becomes something you can use.'
    },
    {
      id: 'launch',
      key: 'launch',
      name: 'Launch',
      heading: 'Unfold it to the world.',
      body: 'We ship it, watch how it behaves, and keep tuning. Then it is yours to run.'
    }
  ],
  services: { heading: 'What we make.' },
  work: { heading: 'Selected work', note: 'DEMO' },
  contact: {
    heading: 'Start with a blank page.',
    text: 'Tell us what you want to make. We will write back.',
    fields: {
      name: 'Name',
      email: 'Email',
      type: 'Project type',
      message: 'Message',
      notSure: 'Not sure',
      submit: 'Start a project',
      submitting: 'Sending…',
      success: 'Thank you. Your message has been received.',
      demoSuccess: 'Demo form: validated locally. No endpoint is configured yet.',
      error: 'Something went wrong. Please try again.'
    },
    validation: {
      name: 'Please enter your name.',
      email: 'Please enter a valid email address.',
      type: 'Please choose a project type.',
      message: 'Please tell us a little about the project.'
    }
  },
  footer: {
    copyright: '© Crease (DEMO)',
    locality: 'Valencia, Spain',
    built: 'Built with Vite and WebGL2',
    backToTop: 'Back to top'
  },
  rail: {
    label: 'Journey progress',
    ticks: ['Start', 'Strategy', 'Design', 'Build', 'Launch']
  },
  posters: {
    hero: 'A blank sheet of paper lying on a pale desk, seen from a low three-quarter angle.',
    strategy:
      'The sheet folded once along a horizontal hinge, with a printed grid appearing on its face.',
    design:
      'The sheet folded into an angular paper form with corners turned and type printed on the upper face.',
    build:
      'The folded sheet standing like an open laptop, with interface ink on the screen half and grid on the deck.',
    launch: 'The sheet unfolded flat and filling the frame as blank paper.'
  }
} as const;
