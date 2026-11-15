const $ = (id) => document.getElementById(id);
const state = { studies: [], study: null, subjects: [], markers: [], series: [], summary: null, genesTimer: 0, metabolicRows: [] };

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function setText(id, value) { $(id).textContent = value; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function init() {
  try {
    initSymptoms();
    await loadAx1MissionPanel();
    await loadNasaSamplePanel();
    state.studies = await getJson('/api/studies');
    const select = $('study-select');
    select.innerHTML = state.studies.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.mission)} · ${escapeHtml(s.id)}</option>`).join('');
    select.addEventListener('change', () => loadStudy(select.value));
    $('refresh-button').addEventListener('click', () => loadStudy(state.study?.id));
    $('subject-select').addEventListener('change', loadCbcSeries);
    $('marker-select').addEventListener('change', loadCbcSeries);
    $('gene-input').addEventListener('input', () => { clearTimeout(state.genesTimer); state.genesTimer = setTimeout(loadGenes, 180); });
    $('gene-input').addEventListener('change', loadExpressionSeries);
    $('body-group-select').addEventListener('change', renderBodyMetric);
    $('bone-button').addEventListener('click', () => setBodyMode('bone'));
    $('muscle-button').addEventListener('click', () => setBodyMode('muscle'));
    await loadBodyData();
    await loadStudy(state.studies[0]?.id);
  } catch (error) { showError(`Não foi possível carregar o painel: ${error.message}`); }
}

async function loadAx1MissionPanel() {
  try {
    const rows=await csv('/api/ax1-radiation-data');
    const readings=rows.map(row=>Number(row.absorbed_dose_rate)).filter(Number.isFinite).sort((a,b)=>a-b);
    const median=values=>{const a=[...values].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
    const grouped=new Map();
    for(const row of rows){const value=Number(row.absorbed_dose_rate);if(!Number.isFinite(value))continue;const day=row.timestamp.slice(0,10);if(!grouped.has(day))grouped.set(day,[]);grouped.get(day).push(value);}
    const days=[...grouped].map(([day,values])=>({day,value:median(values)}));
    setText('ax1-radiation-median',`${median(readings).toLocaleString('pt-BR',{maximumFractionDigits:2})}`);
    setText('ax1-radiation-peak',`${Math.max(...readings).toLocaleString('pt-BR',{maximumFractionDigits:2})}`);
    setText('ax1-radiation-count',readings.length.toLocaleString('pt-BR'));
    setText('ax1-radiation-coverage',`Axiom-1: ${rows[0].timestamp.replace('T',' ')} até ${rows.at(-1).timestamp.replace('T',' ')} · dosímetros ambientais NASA/ISS`);
    renderAx1RadiationChart(days);
  } catch(error) {
    setText('ax1-radiation-coverage',`Não foi possível carregar o CSV RadLab: ${error.message}`);
  }
}

function renderAx1RadiationChart(days) {
  const svg=$('ax1-radiation-chart');if(!svg||!days.length)return;
  const width=850,height=210,pad={left:48,right:20,top:18,bottom:40};
  const values=days.map(point=>point.value),min=Math.min(...values),max=Math.max(...values),span=max-min||1;
  const x=i=>pad.left+i*(width-pad.left-pad.right)/Math.max(1,days.length-1);
  const y=value=>pad.top+(max-value)*(height-pad.top-pad.bottom)/span;
  const path=days.map((point,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const dots=days.map((point,i)=>`<circle cx="${x(i)}" cy="${y(point.value)}" r="4" fill="#328f80"><title>${point.day}: ${point.value.toFixed(2)} µGy/h (mediana diária)</title></circle><text x="${x(i)}" y="${height-12}" text-anchor="middle">${point.day.slice(5)}</text>`).join('');
  const grid=[0,.5,1].map(f=>{const val=min+(max-min)*f,yy=y(val);return `<line x1="${pad.left}" y1="${yy}" x2="${width-pad.right}" y2="${yy}" stroke="#e9efec"/><text x="${pad.left-8}" y="${yy+3}" text-anchor="end">${val.toFixed(1)}</text>`}).join('');
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.innerHTML=`<g class="rad-grid">${grid}</g><path d="${path}" fill="none" stroke="#328f80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}<text class="axis-label" x="${width/2}" y="${height-1}" text-anchor="middle">Dia de abril de 2022 · taxa absorvida (µGy/h)</text>`;
}

async function loadNasaSamplePanel() {
  state.metabolicRows=await csv('/api/metabolic-data');
  const subjects=[...new Set(state.metabolicRows.map(row=>row['Sample Name'].split('_')[0]))].sort();
  $('nasa-subject-select').innerHTML=`<option value="crew">Média da tripulação · ${subjects.length} pessoas</option>`+subjects.map(subject=>`<option value="${escapeHtml(subject)}">Tripulante ${escapeHtml(subject)}</option>`).join('');
  $('nasa-subject-select').addEventListener('change',renderNasaSample);
  $('nasa-timepoint-select').addEventListener('change',renderNasaSample);
  setTimepointOptions(subjects[0]); $('nasa-subject-select').value='crew';
  await renderNasaSample();
}

function phaseDay(phase) { const m=phase.match(/^(L-|R\+)(\d+)/); return m?(m[1]==='L-'?-1:1)*Number(m[2]):0; }
function readableUnit(unit) {
  return ({grams_per_deciliter:'g/dL',percent:'%',thousand_per_microliter:'10³/µL'})[unit]||unit||'';
}
function setTimepointOptions(subject) {
  const rows=state.metabolicRows.filter(row=>row['Sample Name'].startsWith(`${subject}_`));
  rows.sort((a,b)=>phaseDay(a['Sample Name'].split('_').at(-1))-phaseDay(b['Sample Name'].split('_').at(-1)));
  $('nasa-timepoint-select').innerHTML=rows.map(row=>{const phase=row['Sample Name'].split('_').at(-1);return `<option value="${escapeHtml(phase)}">${escapeHtml(phase)} ${phase.startsWith('L-')?'· pré-voo':'· pós-voo'}</option>`;}).join('');
  if(rows.length) $('nasa-timepoint-select').value=rows[rows.length-1]['Sample Name'].split('_').at(-1);
}

function labCard(label,value,unit,min,max,source) {
  const numberOrNaN=v=>v===null||v===undefined||v===''||/^n\/?a$/i.test(String(v))?NaN:Number(v);
  const raw=numberOrNaN(value), rawLo=numberOrNaN(min), rawHi=numberOrNaN(max), n=Number.isFinite(raw)?Number(raw.toFixed(2)):raw, lo=Number.isFinite(rawLo)?Number(rawLo.toFixed(2)):rawLo, hi=Number.isFinite(rawHi)?Number(rawHi.toFixed(2)):rawHi, valid=Number.isFinite(n);
  const ref=Number.isFinite(lo)&&Number.isFinite(hi);
  const status=!valid?'valor ausente':!ref?'sem intervalo no arquivo':n<lo?'abaixo da faixa do laboratório':n>hi?'acima da faixa do laboratório':'dentro da faixa do laboratório';
  const stateClass=valid&&ref?(n<lo||n>hi?'lab-out':'lab-in'):'';
  return `<article class="nasa-lab-card ${stateClass}"><span>${escapeHtml(label)}</span><strong>${valid?`${n} ${escapeHtml(unit)}`:'Não disponível'}</strong><small>${ref?`Referência do laboratório: ${lo}–${hi} ${escapeHtml(unit)} · `:''}${escapeHtml(status)} · ${escapeHtml(source)}</small></article>`;
}

async function renderNasaSample() {
  const subject=$('nasa-subject-select').value, phase=$('nasa-timepoint-select').value;
  if(!subject||!phase) return;
  const subjects=subject==='crew'?[...new Set(state.metabolicRows.map(row=>row['Sample Name'].split('_')[0]))]:[subject];
  const metabolicRows=subjects.map(id=>state.metabolicRows.find(row=>row['Sample Name']===`${id}_serum_${phase}`)).filter(Boolean);
  if(!metabolicRows.length) return;
  const average=values=>{const nums=values.map(Number).filter(Number.isFinite);return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;};
  const metabolic=Object.fromEntries(Object.keys(metabolicRows[0]).map(key=>{const values=metabolicRows.map(row=>Number(row[key])).filter(Number.isFinite);const isLower=key.includes('range_min'),isUpper=key.includes('range_max')||key.includes('_max_');return [key,isLower?(values.length?Math.max(...values):null):isUpper?(values.length?Math.min(...values):null):average(values)];}));
  setText('nasa-sample-label',`${subject==='crew'?`média da tripulação (n=${metabolicRows.length})`:subject} · ${phase} · ${phase.startsWith('L-')?'pré-voo':'pós-voo'}`);
  const markerNames=['hemoglobin','hematocrit','white_blood_cell_count','platelet_count'];
  const subjectSeries=await Promise.all(subjects.map(id=>Promise.all(markerNames.map(marker=>getJson(`/api/series?subject=${encodeURIComponent(id)}&marker=${encodeURIComponent(marker)}`)))));
  const averagedSeries=markerNames.map((_,index)=>subjectSeries.map(rows=>rows[index].find(point=>point.phase===phase)).filter(Boolean));
  const cards=[];
  const glucose=['glucose_value_milligram_per_deciliter','glucose_range_min_milligram_per_deciliter','glucose_range_max_milligram_per_deciliter'];
  cards.push(labCard('Glicose no soro',metabolic[glucose[0]],'mg/dL',metabolic[glucose[1]],metabolic[glucose[2]],'OSD-575'));
  const chemistries=[
    ['Sódio','sodium_value_millimol_per_liter','sodium_range_min_millimol_per_liter','sodium_range_max_millimol_per_liter','mmol/L'],
    ['Potássio','potassium_value_millimol_per_liter','potassium_range_min_millimol_per_liter','potassium_range_max_millimol_per_liter','mmol/L'],
    ['Creatinina','creatinine_value_milligram_per_deciliter','creatinine_range_min_milligram_per_deciliter','creatinine_range_max_milligram_per_deciliter','mg/dL'],
    ['ALT','alt_value_units_per_liter','alt_range_min_units_per_liter','alt_max_units_per_liter','U/L'],
    ['AST','ast_value_units_per_liter','ast_range_min_units_per_liter','ast_max_units_per_liter','U/L']
  ];
  for(const [label,value,min,max,unit] of chemistries) cards.push(labCard(label,metabolic[value],unit,metabolic[min],metabolic[max],'OSD-575'));
  for(const [index,label] of ['Hemoglobina','Hematócrito','Leucócitos','Plaquetas'].entries()) {
    const points=averagedSeries[index];
    if(points.length) cards.push(labCard(label,average(points.map(point=>point.value)),readableUnit(points[0].unit),points[0].reference_min,points[0].reference_max,'OSD-569'));
  }
  $('nasa-lab-values').innerHTML=cards.join('');
}

const symptomKey='orbita-symptoms-v1';
function readSymptoms(){try{return JSON.parse(localStorage.getItem(symptomKey)||'[]')}catch{return []}}
function renderSymptoms(){const rows=readSymptoms();$('symptom-history').innerHTML=rows.length?rows.map(item=>`<article class="checkin-record"><div class="record-top"><strong>${escapeHtml(item.area)} · ${escapeHtml(item.name)}</strong><time>${new Date(item.at).toLocaleString('pt-BR')}</time><span class="record-alert">INTENSIDADE ${item.severity}/10</span></div><div class="record-values"><span>Início: <b>${escapeHtml(item.onset)}</b></span></div>${item.details?`<p class="record-symptom">${escapeHtml(item.details)}</p>`:''}</article>`).join(''):'<div class="history-empty">Nenhum sintoma registrado ainda.</div>'}
function initSymptoms(){renderSymptoms();$('symptom-form').addEventListener('submit',event=>{event.preventDefault();const rows=readSymptoms();rows.unshift({area:$('symptom-area').value,name:$('symptom-name').value.trim(),severity:Number($('symptom-severity').value),onset:$('symptom-onset').value,details:$('symptom-details').value.trim(),at:new Date().toISOString()});localStorage.setItem(symptomKey,JSON.stringify(rows.slice(0,50)));event.target.reset();$('symptom-severity').value='1';renderSymptoms();$('symptom-guidance').classList.add('reported-change');$('symptom-guidance').querySelector('strong').textContent='Relato salvo neste navegador';$('symptom-guidance').querySelector('p').textContent='Se o sintoma for novo, intenso ou estiver piorando, comunique a equipe médica conforme o protocolo da missão.'});$('clear-symptoms').addEventListener('click',()=>{localStorage.removeItem(symptomKey);renderSymptoms()})}

async function loadStudy(id) {
  const study = state.studies.find(item => item.id === id) || state.studies[0];
  if (!study) return;
  state.study = study;
  $('study-select').value = study.id;
  if ($('body-mission-label')) setText('body-mission-label', study.mission);
  if ($('sidebar-mission-name')) setText('sidebar-mission-name', study.mission);
  setText('study-version', study.id);
  setText('mission-caption-subtitle', study.subtitle);
  setText('hero-description', study.description);
  $('study-note').innerHTML = `<strong>Limite do conjunto:</strong> ${escapeHtml(study.note)} Esta visualização é exploratória e não faz diagnóstico nem recomenda tratamento.`;
  $('study-link').href = study.url;
  setText('study-footer-text', `${study.id} · ${study.title}`);
  $('gene-control').hidden = study.type !== 'expression';
  $('subject-control').hidden = study.type === 'expression';
  $('marker-control').hidden = study.type === 'expression';
  $('range-key').hidden = study.type === 'expression';
  setText('chart-marker-title', study.type === 'cbc' ? 'Evolução do marcador' : 'Expressão por condição experimental');
  setText('chart-subtitle', study.type === 'cbc' ? 'Participante —' : 'Valores normalizados por amostra; sem unidade clínica direta');
  setText('collection-count', study.type === 'cbc' ? '7 pontos de coleta' : 'réplicas experimentais');
  setText('unit-label', study.type === 'cbc' ? '—' : 'normalizado');
  $('sample-list').innerHTML = '';
  $('latest-card').innerHTML = '';
  clearChart();
  if (study.type === 'cbc') await loadCbc(); else await loadExpression();
}

async function loadCbc() {
  const [summary, subjects, markers] = await Promise.all([
    getJson('/api/study-summary?id=OSD-569'), getJson('/api/subjects'), getJson('/api/markers')
  ]);
  state.summary = summary; state.subjects = subjects; state.markers = markers;
  $('subject-select').innerHTML = subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  $('marker-select').innerHTML = markers.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.id)}</option>`).join('');
  if (markers.length) $('marker-select').value = markers.find(m => /hemoglobin/i.test(m.id))?.id || markers[0].id;
  setText('stat-one-label','PARTICIPANTES'); setText('stat-two-label','AMOSTRAS'); setText('stat-three-label','MARCADORES'); setText('stat-four-label','JANELA DE COLETA');
  setText('subjects-count',summary.subjects); setText('samples-count',summary.samples); setText('markers-count',summary.markers);
  setText('window-range',`${summary.day_start} a +${summary.day_end}`);
  await loadCbcSeries();
}

async function loadCbcSeries() {
  if (!state.study || state.study.type !== 'cbc') return;
  const subject = $('subject-select').value, marker = $('marker-select').value;
  const markerInfo = state.markers.find(m => m.id === marker);
  const series = await getJson(`/api/series?subject=${encodeURIComponent(subject)}&marker=${encodeURIComponent(marker)}`);
  state.series = series;
  setText('chart-marker-title',marker); setText('chart-subtitle',`Participante ${subject} · dias relativos ao voo`);
  setText('unit-label',markerInfo?.unit || '—'); setText('collection-count',`${series.length} pontos de coleta`);
  setText('sample-count-badge',`${series.length} pontos`);
  renderCbcChart(series);
  $('sample-list').innerHTML = series.map(p => `<div class="sample-item ${p.phase.startsWith('R')?'recovery':''}"><span class="phase-dot">${p.day>0?'R':'L'}</span><div><span class="sample-phase">${escapeHtml(p.phase)}</span><span class="sample-time">dia ${p.day>0?'+':''}${p.day}</span></div><span class="sample-value">${Number(p.value).toFixed(2)}</span></div>`).join('');
  const latest = series[series.length-1];
  $('latest-card').innerHTML = latest ? `<div class="latest-label">ÚLTIMA AMOSTRA · ${escapeHtml(latest.sample)}</div><div class="latest-value">${Number(latest.value).toFixed(2)} <small>${escapeHtml(latest.unit)}</small></div><div class="latest-meta">Dia ${latest.day>0?'+':''}${latest.day} · ${escapeHtml(latest.phase)}</div>` : '';
}

async function loadExpression() {
  const summary = await getJson(`/api/study-summary?id=${encodeURIComponent(state.study.id)}`);
  state.summary = summary;
  setText('stat-one-label','AMOSTRAS'); setText('stat-two-label','CONDIÇÕES'); setText('stat-three-label','FEATURES'); setText('stat-four-label','TIPO DE ENSAIO');
  setText('subjects-count',summary.samples); setText('samples-count',summary.conditions); setText('markers-count',summary.features); setText('window-range',state.study.id === 'OSD-13'?'microarray':'RNA-seq');
  const defaultGene = state.study.id === 'OSD-13' ? 'IL2' : 'CXCL8';
  $('gene-input').value = defaultGene;
  await loadGenes(); await loadExpressionSeries();
}

async function loadGenes() {
  if (!state.study || state.study.type !== 'expression') return;
  const query = $('gene-input').value.trim();
  const genes = await getJson(`/api/genes?study=${encodeURIComponent(state.study.id)}&q=${encodeURIComponent(query)}`);
  $('gene-options').innerHTML = genes.map(g => `<option value="${escapeHtml(g.symbol)}">${escapeHtml(g.name || g.id)}</option>`).join('');
}

async function loadExpressionSeries() {
  if (!state.study || state.study.type !== 'expression') return;
  const gene = $('gene-input').value.trim(); if (!gene) return;
  const series = await getJson(`/api/expression?study=${encodeURIComponent(state.study.id)}&gene=${encodeURIComponent(gene)}`);
  if (!series.length) { showEmpty(`Nenhum registro encontrado para ${gene}. Escolha um gene anotado na lista.`); return; }
  renderExpressionChart(series);
  const groups = [...new Set(series.map(p=>p.condition))];
  setText('chart-marker-title',`Expressão de ${gene}`); setText('chart-subtitle',`${series.length} amostras · ${groups.length} condições · valores normalizados`);
  setText('sample-count-badge',`${series.length} amostras`); setText('collection-count',`${groups.length} condições`);
  $('sample-list').innerHTML = groups.map((condition,index) => {
    const rows=series.filter(p=>p.condition===condition), mean=rows.reduce((a,b)=>a+b.value,0)/rows.length;
    return `<div class="sample-item"><span class="phase-dot">${index+1}</span><div><span class="sample-phase">${escapeHtml(condition.replace(/[._]+/g,' '))}</span><span class="sample-time">${rows.length} réplicas</span></div><span class="sample-value">${mean.toPrecision(4)}</span></div>`;
  }).join('');
  const mean=series.reduce((a,b)=>a+b.value,0)/series.length;
  $('latest-card').innerHTML=`<div class="latest-label">MÉDIA DAS AMOSTRAS EXIBIDAS</div><div class="latest-value">${mean.toPrecision(5)}</div><div class="latest-meta">Medida de expressão experimental; não é valor sanguíneo.</div>`;
}

function clearChart() { $('trend-chart').innerHTML=''; $('chart-empty').hidden=true; }
function showEmpty(message) { clearChart(); $('chart-empty').textContent=message; $('chart-empty').hidden=false; }
function showError(message) { showEmpty(message); }

function renderCbcChart(data) {
  if (!data.length) return showEmpty('Não há amostras para esta combinação.');
  const svg=$('trend-chart'), width=760,height=290,pad={l:56,r:20,t:20,b:40};
  const values=data.map(d=>d.value), mins=data.map(d=>d.reference_min).filter(Number.isFinite), maxs=data.map(d=>d.reference_max).filter(Number.isFinite);
  const lo=Math.min(...values,...mins), hi=Math.max(...values,...maxs), span=hi-lo||1;
  const x=i=>pad.l+i*(width-pad.l-pad.r)/Math.max(1,data.length-1), y=v=>height-pad.b-(v-lo)/span*(height-pad.t-pad.b);
  let html='';
  for(let i=0;i<5;i++){const v=lo+span*i/4, yy=y(v);html+=`<line x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}" stroke="#e9efed"/><text x="${pad.l-9}" y="${yy+3}" text-anchor="end" fill="#8a999b" font-size="9">${v.toPrecision(3)}</text>`;}
  const validMin=data.map(d=>d.reference_min).filter(Number.isFinite),validMax=data.map(d=>d.reference_max).filter(Number.isFinite);
  if(validMin.length&&validMax.length){const low=Math.max(...validMin),high=Math.min(...validMax);html+=`<rect x="${pad.l}" y="${y(high)}" width="${width-pad.l-pad.r}" height="${Math.max(0,y(low)-y(high))}" fill="#e4f3ee" opacity=".8"/>`;}
  html+=`<line x1="${pad.l}" y1="${height-pad.b}" x2="${width-pad.r}" y2="${height-pad.b}" stroke="#cfd9d6"/>`;
  let segment=[];const flush=()=>{if(segment.length>1)html+=`<polyline points="${segment.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#238c80" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;segment=[];};
  data.forEach((d,i)=>{const point={x:x(i),y:y(d.value)};if(i>0&&data[i-1].day<0&&d.day>0)flush();segment.push(point);});flush();
  data.forEach((d,i)=>{const xx=x(i),yy=y(d.value);html+=`<circle cx="${xx}" cy="${yy}" r="4.5" fill="${d.day>0?'#d69850':'#238c80'}" stroke="white" stroke-width="2"><title>${escapeHtml(d.sample)}: ${d.value} ${escapeHtml(d.unit)}</title></circle><text x="${xx}" y="${height-16}" text-anchor="middle" fill="#899799" font-size="8">${d.day>0?'+':''}${d.day}</text>`;});
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.innerHTML=html; $('chart-empty').hidden=true;
}

function renderExpressionChart(data) {
  const groups=[...new Set(data.map(p=>p.condition))], width=760,height=290,pad={l:55,r:20,t:20,b:70};
  const min=Math.min(...data.map(p=>p.value)),max=Math.max(...data.map(p=>p.value)),span=max-min||1;
  const y=v=>height-pad.b-(v-min)/span*(height-pad.t-pad.b), plot=width-pad.l-pad.r;
  const colors=['#238c80','#d69850','#678ac3','#b56b9e'];let html='';
  for(let i=0;i<5;i++){const v=min+span*i/4,yy=y(v);html+=`<line x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}" stroke="#e9efed"/><text x="${pad.l-9}" y="${yy+3}" text-anchor="end" fill="#8a999b" font-size="9">${v.toPrecision(3)}</text>`;}
  groups.forEach((group,g)=>{const rows=data.filter(p=>p.condition===group),cx=pad.l+plot*(g+.5)/groups.length;rows.forEach((p,i)=>{const jitter=(i-(rows.length-1)/2)*Math.min(12,28/rows.length);html+=`<circle cx="${cx+jitter}" cy="${y(p.value)}" r="5" fill="${colors[g%colors.length]}" fill-opacity=".8" stroke="white" stroke-width="1.5"><title>${escapeHtml(p.sample)} · ${escapeHtml(group)}: ${p.value}</title></circle>`;});const mean=rows.reduce((a,b)=>a+b.value,0)/rows.length;html+=`<line x1="${cx-18}" y1="${y(mean)}" x2="${cx+18}" y2="${y(mean)}" stroke="#203d43" stroke-width="2.5"/><text x="${cx}" y="${height-pad.b+15}" text-anchor="middle" fill="#66787d" font-size="8">${escapeHtml(group.replace(/[._]+/g,' ').slice(0,34))}</text>`;});
  $('trend-chart').setAttribute('viewBox',`0 0 ${width} ${height}`);$('trend-chart').innerHTML=html;$('chart-empty').hidden=true;
}

let boneRows = [], leanRows = [], forceRows = [];
let bodyMode = 'bone';
const numeric = value => value === '' || value === undefined ? null : Number(value);
function parseRows(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  const parseLine=line=>{const fields=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}else if(c==='"'){quoted=!quoted;}else if(c===','&&!quoted){fields.push(value);value='';}else value+=c;}fields.push(value);return fields;};
  return lines.map(line => Object.fromEntries(parseLine(line).map((value, i) => [headers[i], value])));
}
const groupOf = row => row['Sample Name'].split('_').slice(1).join('_');
function mean(values) { const v=values.filter(Number.isFinite); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; }
async function csv(url) { const r=await fetch(url); if(!r.ok) throw new Error(`HTTP ${r.status}`); return parseRows(await r.text()); }
async function loadBodyData() {
  try {
    [boneRows, leanRows, forceRows] = await Promise.all([
      csv('/api/musculoskeletal-data'), csv('/api/lean-mass-data'), csv('/api/muscle-force-data')
    ]);
    $('body-group-select').addEventListener('change', renderBodyMetric);
    $('bone-button').addEventListener('click', () => setBodyMode('bone'));
    $('muscle-button').addEventListener('click', () => setBodyMode('lean'));
    $('force-button').addEventListener('click', () => setBodyMode('force'));
    setBodyMode(bodyMode);
  } catch (error) { $('body-data-note').textContent = `Não foi possível carregar os dados musculoesqueléticos: ${error.message}`; }
}
function setBodyMode(mode) {
  bodyMode=mode;
  for (const [id, value] of [['bone-button','bone'],['muscle-button','lean'],['force-button','force']]) $(id).classList.toggle('active',mode===value);
  const rows=mode==='bone'?boneRows:mode==='lean'?leanRows:forceRows;
  let groups=[...new Set(rows.map(groupOf))];
  if (mode==='force') groups=groups.filter(group=>/^(Flox|KD)_(HLS|Control)$/.test(group));
  $('body-group-select').innerHTML=groups.map(g=>`<option value="${escapeHtml(g)}">${escapeHtml(g.replaceAll('_',' '))}</option>`).join('');
  window.dispatchEvent(new CustomEvent('orbita:body-mode',{detail:{mode:mode==='lean'?'muscle':mode}}));
  renderBodyMetric();
}
function renderBodyMetric() {
  const selected=$('body-group-select').value;
  if (!selected) return;
  if (bodyMode==='bone') {
    const rows=boneRows.filter(r=>groupOf(r)===selected).map(r=>({pre:numeric(r.baseline_regional_BMD),post:numeric(r['post-HLS_regional_BMD'])})).filter(r=>r.pre!==null&&r.post!==null);
    const pre=mean(rows.map(r=>r.pre)), post=mean(rows.map(r=>r.post)), pct=pre?(post-pre)/pre*100:null;
    setText('body-metric-label','BMD regional da tíbia'); setText('body-metric-value',pre===null?'Sem dados':`${pre.toFixed(1)} → ${post.toFixed(1)}`);
    setText('body-metric-unit','valores do CSV · basal / pós-HLS'); setText('body-delta-title','MUDANÇA PAREADA PRÉ → PÓS'); setText('body-delta-value',pct===null?'—':`${pct>0?'+':''}${pct.toFixed(1)}%`); setText('body-delta-note',`${rows.length} camundongos com ambas as medições`);
    setText('body-reference-note','Comparação do mesmo grupo experimental; não existe faixa clínica humana comparável para DXA da tíbia de camundongo.');
    setText('body-data-note','Insight experimental: a média pareada mudou no período de HLS. Isso não classifica um astronauta como doente nem autoriza tratamento; HLS é suspensão dos membros posteriores em camundongos.');
  } else if(bodyMode==='lean') {
    const rows=leanRows.filter(r=>groupOf(r)===selected).map(r=>({pre:numeric(r.lean_mass_pre_g),post:numeric(r.lean_mass_post_g)})).filter(r=>r.pre!==null&&r.post!==null);
    const pre=mean(rows.map(r=>r.pre)),post=mean(rows.map(r=>r.post)),pct=pre?(post-pre)/pre*100:null;
    setText('body-metric-label','Massa magra corporal por DXA'); setText('body-metric-value',pre===null?'Sem dados':`${pre.toFixed(3)} → ${post.toFixed(3)} g`);
    setText('body-metric-unit','tecido magro corporal inteiro · basal / pós-HLS'); setText('body-delta-title','MUDANÇA PAREADA PRÉ → PÓS'); setText('body-delta-value',pct===null?'—':`${pct>0?'+':''}${pct.toFixed(1)}%`); setText('body-delta-note',`${rows.length} camundongos com ambas as medições`);
    setText('body-reference-note','Não é medida isolada de músculo nem densidade muscular. Sem faixa saudável humana validada para esta medida animal.');
    setText('body-data-note','Insight experimental: massa magra corporal total antes/depois da HLS. A cor no avatar indica o sistema muscular associado, não uma reconstrução volumétrica da mudança.');
  } else {
    const [genotype, condition]=selected.split('_'), target=forceRows.filter(r=>groupOf(r)===selected).map(r=>numeric(r.frequency_80_hertz)).filter(Number.isFinite);
    const pairedGroup=`${genotype}_${condition==='HLS'?'Control':'HLS'}`;
    const comparison=forceRows.filter(r=>groupOf(r)===pairedGroup).map(r=>numeric(r.frequency_80_hertz)).filter(Number.isFinite);
    const a=mean(target),b=mean(comparison),pct=b?(a-b)/b*100:null;
    setText('body-metric-label','Força contrátil do sóleo · 80 Hz'); setText('body-metric-value',a===null?'Sem dados':a.toFixed(2));
    setText('body-metric-unit','escala original do arquivo; unidade não informada'); setText('body-delta-title',`COMPARAÇÃO COM ${pairedGroup.replaceAll('_',' ').toUpperCase()}`); setText('body-delta-value',pct===null?'—':`${pct>0?'+':''}${pct.toFixed(1)}%`); setText('body-delta-note',`${target.length} vs. ${comparison.length} amostras · mesmo genótipo`);
    setText('body-reference-note','O grupo controle é experimental e de camundongos; não é faixa saudável humana. N=4 por grupo nesta comparação.');
    setText('body-data-note','Insight: comparar a força contrátil do sóleo entre HLS e controle do mesmo genótipo. O protocolo de exercício resistido da NASA é uma contramedida operacional para preservar condicionamento; qualquer conduta individual deve ser definida pela equipe médica e pelo plano aprovado.');
  }
}

init();
