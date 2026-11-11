import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { content, counts, dataStrip, missingFields, warnMissingFields } from '../src/content/index';
import { creasePattern } from '../src/content/crease-pattern';
import { copy } from '../src/content/demo/copy';
import { MODE_SCRIPT, assertModeScript } from '../src/lib/mode';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
mkdirSync(pub, { recursive: true });
warnMissingFields();
assertModeScript();

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
const sha = (s: string): string => 'sha256-' + createHash('sha256').update(s).digest('base64');

const domain = content.studio.domain?.replace(/\/$/, '');
const endpoint = content.studio.formEndpoint;
const email = content.studio.email;
const canonical = domain ? `${domain}/` : undefined;
const ogImage = domain ? `${domain}/og/crease-hero.avif` : '/og/crease-hero.avif';

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  name: content.studio.name,
  description: content.studio.description,
  ...(domain ? { url: domain } : {}),
  address: {
    '@type': 'PostalAddress',
    addressLocality: content.studio.locality,
    addressCountry: content.studio.country
  }
});

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#F4F2EC"/><path d="M8 8h34l14 14v34H8z" fill="#FBFAF7" stroke="#14130F" stroke-width="3"/><path d="M42 8v14h14" fill="none" stroke="#14130F" stroke-width="3"/></svg>`;
writeFileSync(join(pub, 'favicon.svg'), favicon);

/** Art direction by media query, not by candidate width: a DPR 3 phone must still
    get the portrait poster. */
const picture = (key: string, alt: string, cls: string, eager = false): string =>
  `<picture class="${cls}">` +
  `<source media="(max-width: 767px)" srcset="/posters/${key}-mobile.avif" width="900" height="1200">` +
  `<img src="/posters/${key}-desktop.avif" width="1600" height="1000" alt="${esc(alt)}"` +
  `${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">` +
  `</picture>`;

const navLinks = copy.nav.links.map((l) => `<a href="${l.href}">${esc(l.label)}</a>`).join('');

const socials = content.studio.socials.length
  ? `<ul class="socials">${content.studio.socials
      .map((s) => `<li><a href="${esc(s.url)}" rel="me noopener">${esc(s.label)}</a></li>`)
      .join('')}</ul>`
  : '';
const emailLink = email ? `<a class="contact-email" href="mailto:${esc(email)}">${esc(email)}</a>` : '';

const chapters = content.chapters
  .map((c, i) => {
    const side = i % 2 === 0 ? 'right' : 'left';
    return `<section id="${c.id}" class="panel chapter panel-${side}${c.key === 'launch' ? ' panel-launch' : ''}" data-key="${c.key}" aria-labelledby="${c.id}-title">
<div class="panel-inner">
<p class="counter mono">Stage ${i + 1} of ${counts.stages}</p>
<h2 id="${c.id}-title">${esc(c.heading)}</h2>
<p class="body">${esc(c.body)}</p>
</div>
${picture(c.key, copy.posters[c.key], 'panel-poster')}
</section>`;
  })
  .join('\n');

const services = content.services
  .map(
    (s) => `<article class="service-row" aria-labelledby="service-${s.id}">
<h3 id="service-${s.id}">${esc(s.name)}</h3>
<div class="service-detail"><p class="body">${esc(s.sentence)}</p><p class="mono stack">${esc(s.stack)}</p></div>
</article>`
  )
  .join('\n');

const work = content.projects
  .map(
    (p, i) => `<article class="work-row work-row-${i + 1}" aria-labelledby="work-${p.id}">
<div class="work-thumb" aria-hidden="true">${creasePattern(p.seed)}</div>
<div class="work-meta">
<h3 id="work-${p.id}">${esc(p.name)}</h3>
<p class="mono work-data">${esc(p.category)} · <time datetime="${p.year}">${p.year}</time></p>
<p class="body">${esc(p.sentence)}</p>
<p class="mono stack">${esc(p.stack)}</p>
</div>
</article>`
  )
  .join('\n');

const typeOptions = [
  `<option value="" selected disabled>${esc(copy.contact.fields.type)}</option>`,
  ...content.services.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`),
  `<option value="not-sure">${esc(copy.contact.fields.notSure)}</option>`
].join('');

const railHrefs = ['#hero', ...content.chapters.map((c) => `#${c.id}`)];
const railTicks = copy.rail.ticks
  .map((label, i) => {
    const href = railHrefs[i] ?? '#hero';
    return `<li><a href="${href}" data-tick="${i}"${i === 0 ? ' aria-current="step"' : ''}><span class="tick-mark" aria-hidden="true"></span><span class="sr-only">${esc(label)}</span></a></li>`;
  })
  .join('');

const stageKeys = ['hero', 'strategy', 'design', 'build', 'launch'] as const;
const stagePosters = stageKeys
  .map((key, i) => {
    const eager = i === 0;
    // The stage is aria-hidden; poster-swap restores meaningful alt at runtime.
    const alt = eager ? copy.posters.hero : '';
    return `<picture class="stage-picture">` +
      `<source media="(max-width: 767px)" srcset="/posters/${key}-mobile.avif" width="900" height="1200">` +
      `<img class="stage-poster${eager ? ' is-active' : ''}" data-poster="${key}"` +
      ` src="/posters/${key}-desktop.avif" width="1600" height="1000" alt="${esc(alt)}"` +
      `${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${eager ? '' : ' hidden'}>` +
      `</picture>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="en" data-mode="stacked" data-missing="${missingFields.join(',')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crease — Web studio in Valencia (DEMO)</title>
<meta name="description" content="${esc(content.studio.description)}">
${canonical ? `<link rel="canonical" href="${canonical}">\n` : ''}<meta property="og:title" content="Crease — Every website starts flat.">
<meta property="og:description" content="${esc(content.studio.description)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" as="image" href="/posters/hero-desktop.avif" media="(min-width: 768px)" fetchpriority="high">
<link rel="preload" as="image" href="/posters/hero-mobile.avif" media="(max-width: 767px)" fetchpriority="high">
<link rel="preload" as="font" href="/fonts/funnel-display-latin-wght-normal.woff2" type="font/woff2" crossorigin>
<link rel="preload" as="font" href="/fonts/funnel-sans-latin-wght-normal.woff2" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/src/styles/index.css">
<script>${MODE_SCRIPT}</script>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="nav" data-nav>
<div class="nav-inner">
<a class="wordmark" href="#hero" aria-label="Crease, back to start">Crease</a>
<nav class="nav-links" aria-label="Primary">${navLinks}</nav>
<a class="btn btn-ghost nav-cta" href="#contact" data-start-project>${esc(copy.nav.cta)}</a>
</div>
</header>
<nav class="rail" aria-label="${esc(copy.rail.label)}" data-rail>
<div class="rail-track" aria-hidden="true"><div class="rail-fill" data-rail-fill></div></div>
<ol>${railTicks}</ol>
<p class="sr-only" aria-live="polite" data-rail-live></p>
</nav>
<main id="main">
<div class="journey" id="journey" data-journey>
<div class="stage" data-stage aria-hidden="true">
${stagePosters}
</div>
<section id="hero" class="panel hero panel-left" data-key="hero" aria-labelledby="hero-title">
<div class="panel-inner">
<p class="hero-label">${esc(content.studio.label)}</p>
<h1 id="hero-title" class="hero-title">${copy.hero.headline.map((l) => `<span class="line"><span>${esc(l)}</span></span>`).join('')}</h1>
<p class="body hero-support">${esc(copy.hero.support)}</p>
<div class="hero-cta">
<a class="btn btn-solid" href="#process">${esc(copy.hero.primaryCta)}</a>
<a class="btn btn-ghost" href="#contact" data-start-project>${esc(copy.hero.secondaryCta)}</a>
</div>
<p class="mono data-strip">${esc(dataStrip())}</p>
</div>
${picture('hero', copy.posters.hero, 'panel-poster')}
</section>
${chapters}
</div>
<section id="services" class="section section-paper" aria-labelledby="services-title">
<div class="section-inner">
<h2 id="services-title" class="reveal">${esc(copy.services.heading)}</h2>
<div class="services-list">${services}</div>
</div>
</section>
<section id="work" class="section section-paper" aria-labelledby="work-title">
<div class="section-inner">
<div class="work-heading reveal"><h2 id="work-title">${esc(copy.work.heading)}</h2><p class="mono demo-note">${esc(copy.work.note)}</p></div>
<div class="work-list">${work}</div>
</div>
</section>
<section id="contact" class="section section-paper" aria-labelledby="contact-title">
<div class="section-inner contact-grid">
<div class="contact-intro reveal">
<h2 id="contact-title">${esc(copy.contact.heading)}</h2>
<p class="body">${esc(copy.contact.text)}</p>
${emailLink}
${socials}
</div>
<form class="contact-form reveal" data-contact-form data-endpoint="${endpoint ? esc(endpoint) : ''}" data-mailto="${email ? esc(email) : ''}" novalidate>
<div class="field">
<label for="f-name">${esc(copy.contact.fields.name)}</label>
<input id="f-name" name="name" type="text" autocomplete="name" required aria-describedby="f-name-error">
<p class="field-error" id="f-name-error" hidden></p>
</div>
<div class="field">
<label for="f-email">${esc(copy.contact.fields.email)}</label>
<input id="f-email" name="email" type="email" autocomplete="email" required aria-describedby="f-email-error">
<p class="field-error" id="f-email-error" hidden></p>
</div>
<div class="field">
<label for="f-type">${esc(copy.contact.fields.type)}</label>
<select id="f-type" name="type" required aria-describedby="f-type-error">${typeOptions}</select>
<p class="field-error" id="f-type-error" hidden></p>
</div>
<div class="field">
<label for="f-message">${esc(copy.contact.fields.message)}</label>
<textarea id="f-message" name="message" rows="5" required aria-describedby="f-message-error"></textarea>
<p class="field-error" id="f-message-error" hidden></p>
</div>
<div class="hp" aria-hidden="true">
<label for="f-company">Company</label>
<input id="f-company" name="company" type="text" tabindex="-1" autocomplete="off">
</div>
<button class="btn btn-solid" type="submit" data-submit>${esc(copy.contact.fields.submit)}</button>
<p class="form-status" role="status" aria-live="polite" data-form-status></p>
</form>
</div>
</section>
</main>
<footer class="footer section-paper">
<div class="section-inner footer-inner">
<p>${esc(copy.footer.copyright)}</p>
<p>${esc(copy.footer.locality)}</p>
<p>${esc(copy.footer.built)}</p>
<a href="#hero">${esc(copy.footer.backToTop)}</a>
</div>
</footer>
<script type="module" src="/src/main.ts"></script>
</body>
</html>
`;

writeFileSync(join(root, 'index.html'), html);

const robots = `User-agent: *\nAllow: /\n${domain ? `Sitemap: ${domain}/sitemap.xml\n` : ''}`;
writeFileSync(join(pub, 'robots.txt'), robots);
if (domain) {
  writeFileSync(
    join(pub, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${domain}/</loc></url></urlset>`
  );
}

const connectSrc = endpoint ? `'self' ${endpoint}` : "'self'";
const csp = `default-src 'self'; script-src 'self' '${sha(MODE_SCRIPT)}' '${sha(jsonLd)}'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src ${connectSrc}; form-action 'self' mailto:; base-uri 'self'; object-src 'none'`;
const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/posters/*
  Cache-Control: public, max-age=86400

/og/*
  Cache-Control: public, max-age=86400
`;
writeFileSync(join(root, '_headers'), headers);
writeFileSync(join(pub, '_headers'), headers);

console.log(
  `rendered index.html; counts=${JSON.stringify(counts)}; missing=${missingFields.join(',') || 'none'}; mode=${new TextEncoder().encode(MODE_SCRIPT).length}B`
);
