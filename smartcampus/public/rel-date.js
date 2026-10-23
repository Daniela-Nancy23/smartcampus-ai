// Transforme chaque <time class="rel-date" datetime="ISO"> en libellé relatif
// (« il y a 3 h »), tout en gardant la date exacte dans l'attribut title.
// Côté client uniquement : aucune incidence sur le fuseau horaire serveur.
(function () {
  function relatif(iso) {
    var diff = Date.now() - new Date(iso).getTime();
    var min = Math.round(diff / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return 'il y a ' + min + ' min';
    var h = Math.round(min / 60);
    if (h < 24) return 'il y a ' + h + ' h';
    var j = Math.round(h / 24);
    if (j < 30) return 'il y a ' + j + ' j';
    var mo = Math.round(j / 30);
    return 'il y a ' + mo + ' mois';
  }
  document.querySelectorAll('time.rel-date').forEach(function (el) {
    var exact = el.getAttribute('data-exact') || el.textContent;
    el.textContent = relatif(el.getAttribute('datetime'));
    el.title = exact;
  });
})();
