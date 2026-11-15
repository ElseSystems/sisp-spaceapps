(() => {
  const crewIds = ['tripulante-1', 'tripulante-2', 'tripulante-3', 'tripulante-4'];
  const simulateButton = document.getElementById('simulate-emergency');
  const params = new URLSearchParams(window.location.search);
  const selectedId = params.get('astronaut');
  const eventType = params.get('event');
  const panel = document.getElementById('emergency-panel');
  let timerId = null;
  let eventStart = 0;

  simulateButton?.addEventListener('click', () => {
    const id = crewIds[Math.floor(Math.random() * crewIds.length)];
    const payload = { id, startedAt: Date.now(), type: 'cardiac-arrest' };
    sessionStorage.setItem('sisp-emergency-event', JSON.stringify(payload));
    window.location.href = `/?astronaut=${id}&event=cardiac-arrest`;
  });

  const englishAlert = new Audio('/assets/emergency-alert-en-female.mp3');
  englishAlert.preload = 'metadata';
  function stopAlert() {
    englishAlert.pause();
    englishAlert.currentTime = 0;
    window.speechSynthesis?.cancel();
  }
  function speakAlert() {
    stopAlert();
    if (localStorage.getItem('sisp-language') === 'en') {
      englishAlert.play().catch(() => {
        const button = document.getElementById('speak-emergency');
        if (button) button.textContent = '▶ Play audio';
      });
      return;
    }
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const name = document.getElementById('astronaut-name')?.value || 'Tripulante';
    const text = `Simulação de emergência. ${name} apresentou dor no peito, falta de ar, suor frio, aumento súbito da frequência cardíaca e perda de consciência. A telemetria indica parada cardíaca. Acione o protocolo médico da missão, traga o desfibrilador e inicie R C P imediatamente.`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.02;
    utterance.pitch = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  function interpolate(from, to, progress) {
    return from + (to - from) * Math.max(0, Math.min(1, progress));
  }

  function stateForTime(seconds) {
    if (seconds < 4) {
      return { heartRate: interpolate(112, 158, seconds / 4), spo2: interpolate(96, 92, seconds / 4), systolic: 148, diastolic: 94, temperature: 36.7, respiration: 24, stress: 88 };
    }
    if (seconds < 7) {
      return { heartRate: interpolate(168, 190, (seconds - 4) / 3), spo2: interpolate(91, 82, (seconds - 4) / 3), systolic: interpolate(120, 74, (seconds - 4) / 3), diastolic: interpolate(78, 42, (seconds - 4) / 3), temperature: 36.7, respiration: interpolate(18, 5, (seconds - 4) / 3), stress: 100 };
    }
    if (seconds < 18) {
      return { heartRate: 0, spo2: 0, systolic: 0, diastolic: 0, temperature: 36.6, respiration: 0, stress: 100 };
    }
    if (seconds < 23) {
      const progress = (seconds - 18) / 5;
      return { heartRate: interpolate(26, 42, progress), spo2: interpolate(68, 83, progress), systolic: interpolate(58, 78, progress), diastolic: interpolate(32, 46, progress), temperature: 36.6, respiration: interpolate(4, 8, progress), stress: interpolate(96, 78, progress) };
    }
    const progress = (seconds - 23) / 7;
    return { heartRate: interpolate(42, 62, progress), spo2: interpolate(83, 95, progress), systolic: interpolate(78, 104, progress), diastolic: interpolate(46, 68, progress), temperature: 36.6, respiration: interpolate(8, 13, progress), stress: interpolate(78, 52, progress) };
  }

  function setStep(activeStep) {
    document.querySelectorAll('[data-emergency-step]').forEach(item => {
      const step = Number(item.dataset.emergencyStep);
      item.classList.toggle('active', step === activeStep);
      item.classList.toggle('complete', step < activeStep);
    });
  }

  function renderTimeline() {
    const elapsed = Math.min(30, Math.max(0, (Date.now() - eventStart) / 1000));
    const timer = document.getElementById('emergency-timer');
    const phase = document.getElementById('emergency-phase');
    const summary = document.getElementById('emergency-summary');
    const symptoms = document.getElementById('emergency-symptoms');
    document.getElementById('emergency-progress').style.width = `${elapsed / 30 * 100}%`;
    timer.textContent = `00:${String(Math.floor(elapsed)).padStart(2, '0')}`;
    window.sispTelemetry?.setState(stateForTime(elapsed));
    window.sispBody3D?.setCardiacAlert(elapsed < 18 ? 'critical' : 'recovery');

    if (elapsed < 4) {
      phase.textContent = 'SINAIS DE INFARTO';
      summary.textContent = 'Taquicardia súbita e sinais compatíveis com emergência cardíaca.';
      symptoms.textContent = 'Pressão no peito, falta de ar, suor frio, náusea, tontura e ritmo acelerado ou irregular.';
      setStep(1);
    } else if (elapsed < 7) {
      phase.textContent = 'PERDA DE CONSCIÊNCIA';
      summary.textContent = 'O tripulante perdeu a consciência e a circulação está colapsando.';
      symptoms.textContent = 'Sem resposta adequada, respiração anormal e queda rápida de pressão e saturação.';
      setStep(1);
    } else if (elapsed < 18) {
      phase.textContent = 'PARADA CARDÍACA';
      summary.textContent = 'Ausência simulada de pulso e respiração detectáveis.';
      symptoms.textContent = 'Telemetria circulatória e respiratória em zero. RCP e DEA devem estar em andamento.';
      setStep(elapsed < 12 ? 2 : 3);
    } else if (elapsed < 30) {
      phase.textContent = 'RETORNO DO PULSO';
      summary.textContent = 'Pulso fraco retornando após a resposta da tripulação.';
      symptoms.textContent = 'Frequência, pressão, respiração e saturação sobem gradualmente; mantenha suporte e monitoramento.';
      setStep(4);
    } else {
      phase.textContent = 'PULSO RESTABELECIDO';
      summary.textContent = 'Retorno simulado da circulação, ainda exigindo cuidado pós-parada.';
      symptoms.textContent = 'Sinais vitais em recuperação. Manter vigilância contínua e avaliação médica da missão.';
      setStep(5);
      document.getElementById('prevention-insights').hidden = false;
      window.sispEmergencyActive = false;
      window.sispTelemetry?.setState({ heartRate: 62, spo2: 95, systolic: 104, diastolic: 68, temperature: 36.6, respiration: 13, stress: 52 });
      clearInterval(timerId);
    }
  }

  function startEmergency() {
    let stored = null;
    try { stored = JSON.parse(sessionStorage.getItem('sisp-emergency-event') || 'null'); } catch (_) {}
    eventStart = stored?.id === selectedId ? stored.startedAt : Date.now();
    if (Date.now() - eventStart > 32000) eventStart = Date.now();
    window.sispEmergencyActive = true;
    window.sispBody3D?.setCardiacAlert('critical');
    panel.hidden = false;
    const video = document.getElementById('emergency-video');
    if (video) { video.currentTime = 0; video.play().catch(() => {}); }
    document.getElementById('emergency-title').textContent = `Parada cardíaca · ${document.getElementById('astronaut-name')?.value || 'Tripulante'}`;
    renderTimeline();
    timerId = setInterval(renderTimeline, 200);
    setTimeout(speakAlert, 500);
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
  }

  document.getElementById('speak-emergency')?.addEventListener('click', speakAlert);
  document.getElementById('end-emergency')?.addEventListener('click', () => {
    clearInterval(timerId);
    window.sispEmergencyActive = false;
    document.getElementById('emergency-video')?.pause();
    window.sispBody3D?.setCardiacAlert(false);
    stopAlert();
    sessionStorage.removeItem('sisp-emergency-event');
    panel.hidden = true;
    document.getElementById('prevention-insights').hidden = true;
    document.body.classList.remove('sisp-critical');
    window.sispTelemetry?.setState({ heartRate: 72, spo2: 98, systolic: 118, diastolic: 76, temperature: 36.6, respiration: 15, stress: 24 });
    const url = new URL(window.location.href);
    url.searchParams.delete('event');
    history.replaceState({}, '', url);
  });

  if (selectedId && eventType === 'cardiac-arrest') startEmergency();
})();
