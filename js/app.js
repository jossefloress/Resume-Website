/**
 * Resume Website - Dynamic Renderer
 * Fetches resume data from JSON and renders all sections dynamically.
 * Supports progressive enhancement: critical content is in HTML for SEO,
 * JS enhances with animations, dark mode, and dynamic rendering.
 */

(function () {
  'use strict';

  const DATA_URL = './data/resume.json';

  // ─── Utility Helpers ───────────────────────────────────────────────

  function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'className') el.className = val;
      else if (key === 'textContent') el.textContent = val;
      else if (key === 'innerHTML') el.innerHTML = val;
      else el.setAttribute(key, val);
    }
    children.forEach(child => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child) {
        el.appendChild(child);
      }
    });
    return el;
  }

  // ─── Section Renderers ─────────────────────────────────────────────

  function renderHero(data) {
    const hero = document.getElementById('hero');
    if (!hero || !data.meta) return;

    hero.querySelector('.hero-title').textContent = `${data.meta.title} at ${data.meta.company}`;
    hero.querySelector('.hero-tagline').textContent = data.meta.tagline;

    // Status indicator
    const status = hero.querySelector('.hero-status');
    if (status) {
      status.innerHTML = `<span class="status-dot"></span> Currently: ${data.meta.title} @ ${data.meta.company}`;
    }
  }

  function renderEducation(data) {
    const container = document.getElementById('educationline');
    if (!container || !data.education) return;

    // Clear existing content except the title
    const title = container.querySelector('.linetitle');
    container.innerHTML = '';
    container.appendChild(title);

    data.education.forEach(edu => {
      const box = createElement('div', { className: 'two boxes animate-on-scroll' });

      if (edu.logo) {
        const img = createElement('img', {
          src: edu.logo,
          alt: `${edu.school} logo`,
          id: edu.logoId || '',
          loading: 'lazy'
        });
        box.appendChild(img);
      }

      box.appendChild(createElement('h3', { textContent: edu.school }));
      box.appendChild(createElement('p', { innerHTML: `<em>${edu.date}</em>` }));
      box.appendChild(createElement('br'));
      box.appendChild(createElement('p', { textContent: edu.degree }));

      edu.highlights.forEach(h => {
        box.appendChild(createElement('p', { textContent: h }));
      });

      container.appendChild(box);
    });
  }

  function renderExperience(data) {
    const container = document.getElementById('experienceline');
    if (!container || !data.experience) return;

    const title = container.querySelector('.linetitle');
    container.innerHTML = '';
    container.appendChild(title);

    data.experience.forEach(exp => {
      const box = createElement('div', { className: `${exp.size} boxes animate-on-scroll` });

      box.appendChild(createElement('h3', { textContent: exp.company }));
      box.appendChild(createElement('br'));
      box.appendChild(createElement('p', { innerHTML: `<em>${exp.role}</em>` }));
      box.appendChild(createElement('p', { textContent: exp.dates }));
      box.appendChild(createElement('p', { textContent: exp.location }));
      box.appendChild(createElement('br'));

      if (exp.subtitle) {
        box.appendChild(createElement('p', { className: 'subtitle', innerHTML: `<em>${exp.subtitle}</em>` }));
      }

      if (exp.bullets && exp.bullets.length > 0) {
        const ul = createElement('ul');
        exp.bullets.forEach(bullet => {
          ul.appendChild(createElement('li', { textContent: bullet }));
        });
        box.appendChild(ul);
      }

      container.appendChild(box);
    });
  }

  function renderProjects(data) {
    const container = document.getElementById('projectsline');
    if (!container || !data.projects) return;

    const title = container.querySelector('.linetitle');
    container.innerHTML = '';
    container.appendChild(title);

    data.projects.forEach(proj => {
      const box = createElement('div', { className: `${proj.size} boxes animate-on-scroll` });

      box.appendChild(createElement('h3', { textContent: proj.name }));
      box.appendChild(createElement('p', { innerHTML: `<em>${proj.tech}</em>` }));
      box.appendChild(createElement('br'));
      box.appendChild(createElement('p', { textContent: proj.description }));

      if (proj.bullets && proj.bullets.length > 0) {
        box.appendChild(createElement('br'));
        const ul = createElement('ul');
        proj.bullets.forEach(bullet => {
          ul.appendChild(createElement('li', { textContent: bullet }));
        });
        box.appendChild(ul);
      }

      container.appendChild(box);
    });
  }

  function renderSkills(data) {
    const container = document.getElementById('moreline');
    if (!container || !data.skills) return;

    const title = container.querySelector('.linetitle');
    container.innerHTML = '';
    container.appendChild(title);

    // Technical Skills
    const techBox = createElement('div', { className: 'one boxes animate-on-scroll' });
    techBox.appendChild(createElement('h3', { textContent: 'Technical Skills' }));
    const techGrid = createElement('div', { className: 'grid-container three-columns', id: 'skills' });
    data.skills.technical.forEach(skill => {
      techGrid.appendChild(createElement('p', { textContent: skill }));
    });
    techBox.appendChild(techGrid);
    container.appendChild(techBox);

    // Languages
    const langBox = createElement('div', { className: 'two boxes animate-on-scroll' });
    langBox.appendChild(createElement('h3', { textContent: 'Languages' }));
    const langGrid = createElement('div', { className: 'grid-container two-columns' });
    data.skills.languages.forEach(lang => {
      langGrid.appendChild(createElement('p', { textContent: lang.language }));
      langGrid.appendChild(createElement('p', { textContent: lang.level }));
    });
    langBox.appendChild(langGrid);
    container.appendChild(langBox);

    // Focus Areas
    const focusBox = createElement('div', { className: 'one boxes animate-on-scroll', id: 'focus-areas-box' });
    focusBox.appendChild(createElement('h3', { textContent: 'Focus Areas' }));
    const focusGrid = createElement('div', { className: 'focus-areas-grid' });
    data.skills.focusAreas.forEach(area => {
      const card = createElement('div', { className: 'focus-card' });
      card.appendChild(createElement('span', { className: 'focus-icon', textContent: area.icon }));
      card.appendChild(createElement('h4', { textContent: area.title }));
      card.appendChild(createElement('p', { textContent: area.description }));
      focusGrid.appendChild(card);
    });
    focusBox.appendChild(focusGrid);
    container.appendChild(focusBox);
  }

  function renderContact(data) {
    const container = document.getElementById('contactline');
    if (!container || !data.contact) return;

    const title = container.querySelector('.linetitle');
    container.innerHTML = '';
    container.appendChild(title);

    Object.values(data.contact).forEach(item => {
      const box = createElement('div', { className: 'two boxes animate-on-scroll' });
      box.appendChild(createElement('h3', { textContent: item.label }));

      const link = createElement('a', {
        href: item.url,
        target: item.url.startsWith('mailto:') || item.url.startsWith('tel:') ? '_self' : '_blank',
        rel: 'noopener noreferrer'
      }, [item.display]);

      box.appendChild(createElement('p', {}, [link]));
      container.appendChild(box);
    });
  }

  function renderJsonLd(data) {
    if (!data.meta) return;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      'name': data.meta.name,
      'jobTitle': data.meta.title,
      'worksFor': {
        '@type': 'Organization',
        'name': data.meta.company
      },
      'url': data.meta.website,
      'email': data.meta.email,
      'telephone': data.meta.phone,
      'address': {
        '@type': 'PostalAddress',
        'addressLocality': 'Dallas',
        'addressRegion': 'TX',
        'addressCountry': 'US'
      },
      'sameAs': [
        data.meta.linkedin,
        data.meta.github
      ],
      'alumniOf': [
        {
          '@type': 'CollegeOrUniversity',
          'name': 'The University of Texas at Dallas'
        },
        {
          '@type': 'CollegeOrUniversity',
          'name': 'Collin College'
        }
      ],
      'knowsAbout': data.skills ? data.skills.technical : []
    };

    const script = createElement('script', { type: 'application/ld+json' });
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
  }

  // ─── Dark Mode ─────────────────────────────────────────────────────

  function initDarkMode() {
    const toggle = document.getElementById('dark-mode-toggle');
    if (!toggle) return;

    // Check saved preference, then system preference
    const saved = localStorage.getItem('theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      updateToggleIcon(toggle, saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
      updateToggleIcon(toggle, 'dark');
    }

    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateToggleIcon(toggle, next);
    });

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        const theme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        updateToggleIcon(toggle, theme);
      }
    });
  }

  function updateToggleIcon(toggle, theme) {
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.textContent = theme === 'dark' ? '\u2600' : '\u263D';
  }

  // ─── Scroll Animations ─────────────────────────────────────────────

  function initScrollAnimations() {
    const elements = document.querySelectorAll('.animate-on-scroll');
    if (!elements.length) return;

    // If IntersectionObserver is not supported, show everything immediately
    if (!('IntersectionObserver' in window)) {
      elements.forEach(el => el.classList.add('animated'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.05,
      rootMargin: '0px 0px 0px 0px'
    });

    elements.forEach(el => {
      // If element is already in viewport, animate immediately
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add('animated');
      } else {
        observer.observe(el);
      }
    });
  }

  // ─── Service Worker Registration ──────────────────────────────────

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Service worker registration failed silently
      });
    }
  }

  // ─── Main Init ─────────────────────────────────────────────────────

  async function init() {
    // Initialize dark mode immediately (doesn't depend on data)
    initDarkMode();

    // Register service worker
    registerServiceWorker();

    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Render all sections
      renderHero(data);
      renderEducation(data);
      renderExperience(data);
      renderProjects(data);
      renderSkills(data);
      renderContact(data);
      renderJsonLd(data);

      // Initialize scroll animations after content is rendered
      // Double rAF ensures the browser has laid out + painted the new elements
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          initScrollAnimations();
        });
      });

    } catch (error) {
      // If JSON fetch fails, the static HTML content remains visible (progressive enhancement)
      console.warn('Failed to load resume data, using static content:', error.message);
      initScrollAnimations();
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
