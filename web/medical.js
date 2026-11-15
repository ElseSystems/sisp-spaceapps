(() => {
  const id = Number(new URLSearchParams(location.search).get('astronaut')?.split('-').pop());
  if (![1, 2, 3, 4].includes(id)) return;
  const participant = 'C00' + id;
  const panel = document.createElement('section');
  panel.className = 'telemetry-panel';
  panel.style.marginTop = '24px';
  document.getElementById('dashboard-screen').append(panel);
  panel.innerHTML = '<h2>Exames pré e pós-voo · Tripulante ' + id + '</h2><p>Histórico humano NASA OSDR · Inspiration4 · associação de demonstração entre o participante pseudonimizado e este perfil. A telemetria ao vivo permanece simulada.</p><div id="medical-results">Carregando exames…</div>';
  const result = panel.querySelector('#medical-results');
  function parse(text) {
    const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => line.split(','));
    return lines.slice(1).map(values => Object.fromEntries(lines[0].map((key, i) => [key, values[i]])));
  }
  const value = raw => raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;
  const fmt = number => number === null ? 'Indisponível' : number.toLocaleString('pt-BR', {maximumFractionDigits: 2});
  const day = row => { const match = row['Sample Name'].match(/_([LR])[-+](\d+)/); return match ? Number(match[2]) * (match[1] === 'L' ? -1 : 1) : NaN; };
  Promise.all(['/api/human-cbc', '/api/metabolic-data'].map(async url => {
    const response = await fetch(url); if (!response.ok) throw Error('Falha ao carregar exames');
    return parse(await response.text()).filter(row => row['Sample Name'].startsWith(participant + '_')).sort((a, b) => day(a) - day(b));
  })).then(groups => {
    result.textContent = '';
    const insights = [];
    groups.forEach((rows, index) => {
      const preRows = rows.filter(row => day(row) < 0);
      const postRows = rows.filter(row => day(row) >= 0);
      const heading = document.createElement('h3'); heading.textContent = index ? 'Painel metabólico · OSD-575' : 'Hemograma · OSD-569'; result.append(heading);
      if (!preRows.length || !postRows.length) { result.append('Comparação indisponível.'); return; }
      const pre = preRows.at(-1), post = postRows[0];
      const note = document.createElement('p');
      note.textContent = 'Comparação: dia ' + day(pre) + ' → dia +' + day(post) + '. Selecione outras coletas para acompanhar o histórico.';
      result.append(note);
      const preSelect = document.createElement('select'), postSelect = document.createElement('select');
      [preSelect, postSelect].forEach((select, i) => {
        select.setAttribute('aria-label', i ? 'Coleta pós-voo' : 'Coleta pré-voo');
        (i ? postRows : preRows).forEach(row => { const option = document.createElement('option'); option.value = row['Sample Name']; option.textContent = 'Dia ' + (day(row) > 0 ? '+' : '') + day(row); select.append(option); });
        select.value = (i ? post : pre)['Sample Name']; result.append(select);
      });
      const wrap = document.createElement('div'); wrap.style.overflowX = 'auto'; result.append(wrap);
      const keys = Object.keys(pre).filter(key => key.includes('_value'));
      function render() {
        const a = rows.find(row => row['Sample Name'] === preSelect.value), b = rows.find(row => row['Sample Name'] === postSelect.value);
        wrap.innerHTML = '<table style="width:100%;text-align:left;border-spacing:0 12px"><thead><tr><th>Exame / unidade original</th><th>Pré-voo</th><th>Pós-voo</th><th>Variação</th><th>Referência do ensaio</th></tr></thead><tbody></tbody></table>';
        keys.forEach(key => {
          const av = value(a[key]), bv = value(b[key]);
          const prefix = key.split('_value')[0];
          const minKey = Object.keys(b).find(k => k.startsWith(prefix + '_range_min'));
          const maxKey = Object.keys(b).find(k => k.startsWith(prefix + '_range_max') || k.startsWith(prefix + '_max_'));
          const low = value(b[minKey]), high = value(b[maxKey]);
          const tr = document.createElement('tr');
          const delta = av !== null && bv !== null && av !== 0 ? (bv - av) / av * 100 : null;
          [key.replaceAll('_', ' '), fmt(av), fmt(bv), delta === null ? '—' : fmt(delta) + '%', fmt(low) + ' – ' + fmt(high)].forEach(text => { const td = document.createElement('td'); td.textContent = text; tr.append(td); });
          if (bv !== null && ((low !== null && bv < low) || (high !== null && bv > high))) tr.style.color = '#ffb78c';
          wrap.querySelector('tbody').append(tr);
        });
      }
      preSelect.onchange = postSelect.onchange = render; render();
      keys.forEach(key => {
        const av = value(pre[key]), bv = value(post[key]), prefix = key.split('_value')[0];
        const min = value(post[Object.keys(post).find(k => k.startsWith(prefix + '_range_min'))]);
        const max = value(post[Object.keys(post).find(k => k.startsWith(prefix + '_range_max') || k.startsWith(prefix + '_max_'))]);
        if (bv !== null && ((min !== null && bv < min) || (max !== null && bv > max))) insights.push(prefix.replaceAll('_', ' ') + ': pós-voo ' + fmt(bv) + ', fora da referência deste ensaio. Comparar com as outras coletas e solicitar revisão médica; este achado isolado não estabelece diagnóstico.');
        else if (av !== null && bv !== null && av !== 0 && Math.abs((bv-av)/av) > .15) insights.push(prefix.replaceAll('_', ' ') + ': mudança de ' + fmt((bv-av)/av*100) + '% na primeira coleta pós-voo. Acompanhar tendência e contexto da coleta com a equipe médica.');
      });
    });
    const title = document.createElement('h3'); title.textContent = 'Insights dos exames · Tripulante ' + id; result.append(title);
    const list = document.createElement('ul');
    (insights.length ? insights : ['Nenhum desvio identificado nas referências disponíveis da primeira coleta pós-voo. Manter acompanhamento das próximas coletas.']).forEach(text => { const li = document.createElement('li'); li.textContent = text; list.append(li); }); result.append(list);
    const muscle = document.createElement('p');
    muscle.textContent = 'Músculos e ossos: não há DXA ou volume muscular individual nestes dois arquivos humanos. Não é possível calcular um aumento seguro de exercício em %. Solicitar DXA, avaliação de força/volume muscular e revisão do plano individual. Após o evento cardíaco simulado, a retomada de exercício depende de liberação médica.';
    result.append(muscle);
    const sources = document.createElement('p'); sources.innerHTML = '<a href="https://osdr.nasa.gov/bio/repo/data/studies/OSD-569" target="_blank" rel="noopener">Fonte humana: OSD-569</a> · <a href="https://osdr.nasa.gov/bio/repo/data/studies/OSD-575" target="_blank" rel="noopener">Fonte humana: OSD-575</a> · <a href="https://www.nature.com/articles/s41526-020-00111-x" target="_blank" rel="noopener">Estudo humano SPRINT: músculo, osso e exercício (resultados de grupo)</a>';
    result.append(sources);
  }).catch(() => { result.textContent = 'Não foi possível carregar os exames. Atualize a página para tentar novamente.'; });
})();
