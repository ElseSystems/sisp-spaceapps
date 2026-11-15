(() => {
  const form = document.getElementById('vitals-form');
  if (!form) return;
  const key = 'orbita-health-checkin-v1';
  const fields = ['heartRate', 'spo2', 'bloodPressure', 'glucose', 'temperature', 'sleep', 'mood'];
  const read = () => {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); }
    catch { return {}; }
  };
  const saved = read();
  for (const name of fields) {
    if (saved[name] !== undefined) form.elements[name].value = saved[name];
    const state = form.querySelector(`[data-state="${name}"]`);
    if (state && saved[name] !== undefined && saved[name] !== '') state.textContent = 'Registrado manualmente';
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(fields.map(name => [name, form.elements[name].value.trim()]));
    values.updatedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(values));
    for (const name of fields) {
      const state = form.querySelector(`[data-state="${name}"]`);
      if (state) state.textContent = values[name] ? 'Registrado manualmente' : 'Sem leitura';
    }
    const title = document.getElementById('alert-title');
    const copy = document.getElementById('alert-copy');
    if (title) title.textContent = 'Check-in salvo';
    if (copy) copy.textContent = 'Medições registradas neste dispositivo. Revise tendências e siga o protocolo da missão se notar uma mudança ou sintoma.';
  });

  document.getElementById('symptom-form')?.addEventListener('submit', () => {
    const title = document.getElementById('alert-title');
    const copy = document.getElementById('alert-copy');
    const name = document.getElementById('symptom-name')?.value.trim();
    if (title) title.textContent = 'Relato de sintoma salvo';
    if (copy) copy.textContent = `${name ? `“${name}” foi registrado. ` : ''}Siga os procedimentos da missão e contate a equipe médica conforme necessário.`;
  }, true);
})();
