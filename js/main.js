(function () {
  const BH = (window.BH = window.BH || {});
  const $ = (id) => document.getElementById(id);

  BH.main = {
    show(view) {
      ['build', 'edit'].forEach((v) => {
        $('view-' + v).hidden = v !== view;
        $('tab-' + v).setAttribute('aria-selected', v === view ? 'true' : 'false');
      });
      if (view === 'edit') BH.admin.render();
      if (view === 'build') BH.build.refresh();
      try { history.replaceState(null, '', '#' + view); } catch (e) { /* file previews may block this */ }
    },
  };

  document.getElementById('logo').src = window.BH_ASSETS.logo;
  BH.store.load();
  BH.build.init();
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => BH.main.show(b.dataset.view)));
  if (location.hash === '#edit') BH.main.show('edit');
})();
