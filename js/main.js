document.addEventListener('DOMContentLoaded', () => {
  const content = document.querySelector('.content');
  const sections = document.querySelectorAll('.section');
  
  const currentYear = new Date().getFullYear();
  const footerYear = document.querySelector('.footer p');
  if (footerYear) {
    footerYear.innerHTML = `&copy; 2009-${currentYear} Malkevnia. Todos los derechos reservados.`;
  }
  
  content.style.opacity = '0';
  content.style.transform = 'translateY(20px)';
  
  setTimeout(() => {
    content.style.transition = 'opacity 1s ease, transform 1s ease';
    content.style.opacity = '1';
    content.style.transform = 'translateY(0)';
  }, 300);
  
  sections.forEach((section, index) => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
      section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      section.style.opacity = '1';
      section.style.transform = 'translateY(0)';
    }, 600 + (index * 200));
  });
  
  createRandomShootingStars();
});

function createRandomShootingStars() {
  const background = document.querySelector('.background');
  
  setInterval(() => {
    const star = document.createElement('div');
    star.classList.add('random-shooting-star');
    
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

const style = document.createElement('style');
style.innerHTML = `
  @keyframes shootingStar {
    0% {
      opacity: 0;
      transform: rotate(15deg) translateX(0);
    }
    5% {
      opacity: 1;
    }
    95% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: rotate(15deg) translateX(calc(100vw + 200px));
    }
  }
`;
document.head.appendChild(style);