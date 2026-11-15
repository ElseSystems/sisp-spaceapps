(() => {
  const byId = id => document.getElementById(id);
  const state = { heartRate: 72, spo2: 98, systolic: 118, diastolic: 76, temperature: 36.6, respiration: 15, stress: 24 };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const drift = (value, amount, min, max, decimals = 0) => {
    const next = clamp(value + (Math.random() - 0.5) * amount, min, max);
    return decimals ? Number(next.toFixed(decimals)) : Math.round(next);
  };

  function setStatus(key, text, attention = false) {
    const card = document.querySelector(`[data-vital="${key}"]`);
    const badge = card?.querySelector('header b');
    if (!card || !badge) return;
    badge.textContent = text;
    badge.className = attention ? 'attention' : 'normal';
    card.classList.toggle('attention-card', attention);
  }

  function wave(baseline, pulse, phase = 0) {
    const points = [];
    for (let x = 0; x <= 160; x += 4) {
      const beat = (x + phase) % 48;
      let y = baseline + Math.sin((x + phase) / 11) * 1.1;
      if (beat > 20 && beat < 24) y -= pulse;
      else if (beat >= 24 && beat < 28) y += pulse * 0.65;
      points.push(`${x},${y.toFixed(1)}`);
    }
    return `M${points.join(' L')}`;
  }

  function render() {
    if (!byId('heart-rate')) return;
    byId('heart-rate').textContent = Math.round(state.heartRate);
    byId('spo2').textContent = Math.round(state.spo2);
    byId('blood-pressure').textContent = `${Math.round(state.systolic)}/${Math.round(state.diastolic)}`;
    byId('temperature').textContent = Number(state.temperature).toFixed(1).replace('.', ',');
    byId('respiration').textContent = Math.round(state.respiration);
    byId('stress').textContent = Math.round(state.stress);
    byId('spo2-meter').style.width = `${clamp(state.spo2, 0, 100)}%`;
    byId('stress-meter').style.width = `${clamp(state.stress, 0, 100)}%`;
    byId('temperature-marker').style.left = `${clamp((state.temperature - 35) / 3.5 * 100, 2, 96)}%`;
    byId('heart-wave').setAttribute('d', state.heartRate <= 0 ? 'M0 22 L160 22' : wave(20, 15, state.heartRate % 24));
    byId('respiration-wave').setAttribute('d', state.respiration <= 0 ? 'M0 22 L160 22' : `M0 22 C20 22 20 ${10 + (state.respiration % 4)} 40 ${10 + (state.respiration % 4)} S60 22 80 22 S100 ${10 + (state.respiration % 4)} 120 ${10 + (state.respiration % 4)} S140 22 160 22`);

    const arrest = state.heartRate <= 0 && state.respiration <= 0;
    const attention = arrest || state.spo2 < 95 || state.heartRate > 100 || state.heartRate < 50 || state.systolic > 139 || state.systolic < 90 || state.temperature > 37.5 || state.stress > 65;
    setStatus('heartRate', arrest ? 'Sem pulso' : state.heartRate > 100 ? 'Crítico' : state.heartRate < 50 ? 'Baixo' : 'Normal', arrest || state.heartRate > 100 || state.heartRate < 50);
    setStatus('spo2', state.spo2 < 90 ? 'Crítico' : state.spo2 < 95 ? 'Atenção' : 'Normal', state.spo2 < 95);
    setStatus('bloodPressure', state.systolic < 90 ? 'Crítico' : state.systolic > 139 ? 'Atenção' : 'Normal', state.systolic < 90 || state.systolic > 139);
    setStatus('temperature', 'Normal', false);
    setStatus('respiration', arrest ? 'Ausente' : state.respiration > 20 || state.respiration < 10 ? 'Atenção' : 'Normal', arrest || state.respiration > 20 || state.respiration < 10);
    setStatus('stress', state.stress > 65 ? 'Elevado' : 'Baixo', state.stress > 65);
    byId('overall-status').textContent = arrest ? 'EMERGÊNCIA' : attention ? 'Atenção' : 'Estável';
    byId('sensor-summary-title').textContent = arrest ? 'Parada cardíaca detectada' : attention ? 'Revisar indicador' : 'Indicadores estáveis';
    byId('sensor-summary-text').textContent = arrest ? 'Ausência simulada de pulso e respiração. Inicie o protocolo de resposta.' : attention ? 'A simulação detectou valores fora da faixa esperada.' : 'Nenhuma alteração relevante detectada na simulação atual.';
    byId('last-reading').textContent = `Leitura ${new Date().toLocaleTimeString('pt-BR')}`;
    document.body.classList.toggle('sisp-critical', arrest || window.sispEmergencyActive === true);
  }

  function tick() {
    if (window.sispEmergencyActive) return;
    state.heartRate = drift(state.heartRate, 4, 64, 88);
    state.spo2 = drift(state.spo2, 1.2, 96, 100);
    state.systolic = drift(state.systolic, 4, 108, 128);
    state.diastolic = drift(state.diastolic, 3, 68, 84);
    state.temperature = drift(state.temperature, 0.15, 36.2, 37.1, 1);
    state.respiration = drift(state.respiration, 2, 12, 18);
    state.stress = drift(state.stress, 5, 16, 42);
    render();
  }

  function clock() {
    if (byId('telemetry-clock')) byId('telemetry-clock').textContent = new Date().toLocaleTimeString('pt-BR');
  }

  window.sispTelemetry = {
    state,
    render,
    setState(values) {
      Object.assign(state, values);
      render();
    }
  };

  render();
  clock();
  setInterval(tick, 2600);
  setInterval(clock, 1000);
})();
