document.addEventListener('DOMContentLoaded', () => {
  const content = document.querySelector('.content');
  const sections = document.querySelectorAll('.section');

  const currentYear = new Date().getFullYear();
  const footerYear = document.querySelector('.footer p');
  if (footerYear) {
    footerYear.textContent = `\u00A9 2009-${currentYear} Malkevnia. Todos los derechos reservados.`;
  }

  // Letter-by-letter reveal on title
  const titleSpan = document.querySelector('.content span');
  if (titleSpan) {
    const text = titleSpan.textContent;
    titleSpan.textContent = '';

    [...text].forEach((char, i) => {
      const letter = document.createElement('span');
      letter.textContent = char;
      letter.className = 'title-letter';
      letter.style.animationDelay = `0s, ${0.5 + i * 0.1}s`;
      titleSpan.appendChild(letter);
    });
  }

  document.body.style.overflow = 'hidden';

  content.classList.add('fade-hidden');

  setTimeout(() => {
    content.style.transition = 'opacity 1s ease, transform 1s ease';
    content.classList.remove('fade-hidden');
  }, 300);

  const lastSectionDelay = 600 + ((sections.length - 1) * 200) + 800;

  sections.forEach((section, index) => {
    section.classList.add('fade-hidden');

    setTimeout(() => {
      section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      section.classList.remove('fade-hidden');

      setTimeout(() => {
        section.style.transition = '';
      }, 800);
    }, 600 + (index * 200));
  });

  setTimeout(() => {
    document.body.style.overflow = '';
  }, lastSectionDelay);

  createRandomShootingStars();
  initParallax();
  initCursorGlow();
});

let shootingStarInterval = null;

function createRandomShootingStars() {
  const background = document.querySelector('.background');

  function startInterval() {
    if (shootingStarInterval) return;
    shootingStarInterval = setInterval(() => {
      const star = document.createElement('div');

      const startY = Math.random() * 80;
      const duration = 2 + Math.random() * 3;
      const length = 50 + Math.random() * 100;

      star.style.cssText = `
        position: absolute;
        top: ${startY}vh;
        left: -100px;
        height: 2px;
        width: ${length}px;
        background: linear-gradient(-45deg, #5f91ff, rgba(0, 0, 255, 0));
        border-radius: 999px;
        filter: drop-shadow(0 0 6px #699bff);
        animation: shootingStar ${duration}s linear forwards;
        opacity: 0;
        transform: rotate(15deg);
        z-index: 5;
      `;

      background.appendChild(star);

      setTimeout(() => {
        star.remove();
      }, duration * 1000);
    }, 5000);
  }

  function stopInterval() {
    if (shootingStarInterval) {
      clearInterval(shootingStarInterval);
      shootingStarInterval = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopInterval();
    } else {
      startInterval();
    }
  });

  startInterval();
}

function initParallax() {
  if ('ontouchstart' in window) return;

  const starsLayer = document.querySelector('.stars');
  const stars2Layer = document.querySelector('.stars2');
  const stars3Layer = document.querySelector('.stars3');

  if (!starsLayer || !stars2Layer || !stars3Layer) return;

  let mouseX = 0;
  let mouseY = 0;
  let currentX = 0;
  let currentY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function update() {
    currentX += (mouseX - currentX) * 0.05;
    currentY += (mouseY - currentY) * 0.05;

    starsLayer.style.translate = `${currentX * 10}px ${currentY * 10}px`;
    stars2Layer.style.translate = `${currentX * 25}px ${currentY * 25}px`;
    stars3Layer.style.translate = `${currentX * 45}px ${currentY * 45}px`;

    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

function initCursorGlow() {
  if ('ontouchstart' in window) return;
  if (document.body.classList.contains('blog')) return;

  const crosshair = document.createElement('div');
  crosshair.className = 'cursor-crosshair';
  document.body.appendChild(crosshair);

  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  document.body.appendChild(glow);

  let targetX = 0;
  let targetY = 0;
  let glowX = 0;
  let glowY = 0;

  document.addEventListener('mousemove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
    crosshair.style.left = targetX + 'px';
    crosshair.style.top = targetY + 'px';
  });

  document.addEventListener('mouseenter', () => {
    crosshair.style.opacity = '1';
    glow.style.opacity = '1';
  });

  document.addEventListener('mouseleave', () => {
    crosshair.style.opacity = '0';
    glow.style.opacity = '0';
  });

  function update() {
    glowX += (targetX - glowX) * 0.15;
    glowY += (targetY - glowY) * 0.15;

    glow.style.left = glowX + 'px';
    glow.style.top = glowY + 'px';

    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}
