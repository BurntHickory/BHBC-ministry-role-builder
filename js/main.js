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
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.view === 'edit' && !(await BH.store.ensureUnlocked())) return;
    BH.main.show(b.dataset.view);
  }));
  BH.store.init().then(async () => {
    BH.build.init();
    if (location.hash === '#edit' && (await BH.store.ensureUnlocked())) BH.main.show('edit');
  });
})();
