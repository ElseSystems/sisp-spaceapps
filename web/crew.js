(() => {
  const crewScreen = document.getElementById('crew-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const nameInput = document.getElementById('astronaut-name');
  const cards = [...document.querySelectorAll('.crew-card')];
  const crew = new Map(cards.map(card => [card.dataset.astronautId, {
    id: card.dataset.astronautId,
    name: card.dataset.astronautName,
    card
  }]));

  const photoKey = id => `sisp-crew-photo-${id}`;
  const nameKey = id => `sisp-crew-name-${id}`;
  const telemetry = new Map(cards.map((card, index) => [card.dataset.astronautId, {
    heartRate: [72, 76, 69, 74][index],
    spo2: [98, 97, 99, 98][index]
  }]));

  function updateCrewTelemetry() {
    cards.forEach(card => {
      const state = telemetry.get(card.dataset.astronautId);
      state.heartRate = Math.max(64, Math.min(88, Math.round(state.heartRate + (Math.random() - 0.5) * 4)));
      state.spo2 = Math.max(96, Math.min(100, Math.round(state.spo2 + (Math.random() - 0.5) * 1.4)));
      card.querySelector('[data-crew-heart]').textContent = state.heartRate;
      card.querySelector('[data-crew-spo2]').textContent = state.spo2;
    });
  }

  function renderPhoto(profile) {
    const image = profile.card.querySelector('.crew-avatar img');
    const initials = profile.card.querySelector('.crew-initials');
    const stored = localStorage.getItem(photoKey(profile.id));
    if (stored) {
      image.src = stored;
      image.hidden = false;
      initials.hidden = true;
    } else {
      image.src = `/assets/crew-${profile.id.slice(-1)}.png`;
      image.hidden = false;
      initials.hidden = true;
    }
  }

  function savePhoto(profile, file) {
    if (!file?.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const source = new Image();
      source.addEventListener('load', () => {
        const size = 480;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        const scale = Math.max(size / source.width, size / source.height);
        const width = source.width * scale;
        const height = source.height * scale;
        context.drawImage(source, (size - width) / 2, (size - height) / 2, width, height);
        localStorage.setItem(photoKey(profile.id), canvas.toDataURL('image/jpeg', 0.82));
        renderPhoto(profile);
      });
      source.src = reader.result;
    });
    reader.readAsDataURL(file);
  }

  function openProfile(profile) {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('astronaut', profile.id);
    window.location.href = url.toString();
  }

  cards.forEach(card => {
    const profile = crew.get(card.dataset.astronautId);
    renderPhoto(profile);
    card.querySelector('.crew-open').addEventListener('click', () => openProfile(profile));
    card.querySelector('.crew-photo-input').addEventListener('change', event => {
      savePhoto(profile, event.target.files?.[0]);
      event.target.value = '';
    });
  });

  const selectedId = new URLSearchParams(window.location.search).get('astronaut');
  const selected = crew.get(selectedId);
  if (selected) {
    document.body.classList.remove('crew-home-active');
    document.body.classList.add('crew-dashboard-active');
    crewScreen.hidden = true;
    dashboardScreen.hidden = false;
    const savedName = localStorage.getItem(nameKey(selected.id));
    nameInput.value = savedName || selected.name;
    document.title = `${nameInput.value} | SISP`;
    document.body.dataset.astronautId = selected.id;
    window.dispatchEvent(new CustomEvent('sisp:dashboard-ready'));
  } else {
    document.body.classList.add('crew-home-active');
    document.body.classList.remove('crew-dashboard-active');
    crewScreen.hidden = false;
    dashboardScreen.hidden = true;
    document.title = 'Tripulação | SISP';
  }

  nameInput.addEventListener('input', () => {
    const id = document.body.dataset.astronautId;
    if (id) localStorage.setItem(nameKey(id), nameInput.value.trim());
  });

  document.getElementById('back-to-crew').addEventListener('click', () => {
    window.location.href = '/';
  });

  updateCrewTelemetry();
  setInterval(updateCrewTelemetry, 2600);
})();
