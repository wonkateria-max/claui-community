// Keep the full About + social links close to the top on phones.
// Desktop retains the original section order.
(() => {
  const about = document.getElementById('about');
  const community = document.getElementById('community');
  if (!about || !community) return;

  const originalPosition = document.createComment('About section desktop position');
  about.before(originalPosition);

  const mobile = window.matchMedia('(max-width: 760px)');
  const placeAbout = () => {
    if (mobile.matches) {
      community.before(about);
    } else {
      originalPosition.after(about);
    }
  };

  placeAbout();
  mobile.addEventListener('change', placeAbout);
})();
