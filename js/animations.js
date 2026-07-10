'use strict';

window.MeteoAnimations = (() => {
  function reveal() {
    const elements = document.querySelectorAll('.card, .hero, footer');
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    elements.forEach(element => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(16px)';
      element.style.transition = 'opacity .55s ease, transform .55s ease';
      observer.observe(element);
    });
  }

  function updateTheme(code, isDay) {
    const info = WeatherUtils.info(code, isDay);
    document.body.classList.remove(
      'weather-clear', 'weather-cloudy', 'weather-rain',
      'weather-storm', 'weather-snow', 'is-night'
    );
    document.body.classList.add(`weather-${info.theme}`);
    if (Number(isDay) === 0) document.body.classList.add('is-night');
  }

  return { reveal, updateTheme };
})();
