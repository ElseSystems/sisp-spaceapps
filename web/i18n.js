(() => {
  const saved = localStorage.getItem('sisp-language');
  let locale = saved === 'en' ? 'en' : 'pt-BR';
  const originals = new WeakMap();
  let reverse = new Map(), translations = new Map();
  const selector = document.createElement('div');
  selector.setAttribute('role', 'group');
  selector.setAttribute('aria-label', 'Idioma / Language');
  selector.style.cssText = 'display:flex;gap:4px;margin-left:auto;margin-right:20px;flex-shrink:0';
  selector.innerHTML = '<button type="button" data-language="pt-BR" aria-label="Português brasileiro">PT</button><button type="button" data-language="en" aria-label="English">EN</button>';
  document.querySelector('.sisp-header').insertBefore(selector, document.querySelector('.connection-state'));
  function updateButtons() {
    selector.querySelectorAll('button').forEach(button => {
      const active = button.dataset.language === locale;
      button.setAttribute('aria-pressed', String(active));
      button.style.cssText = 'cursor:pointer;border:1px solid #395063;border-radius:7px;padding:8px 10px;font:700 12px sans-serif;background:' + (active ? '#254c65' : '#101e29') + ';color:' + (active ? '#fff' : '#95afc1');
    });
  }
  updateButtons();
  function translate(text) {
    const core = text.trim();
    let translated = translations.get(core);
    if (!translated) {
      translated = core.replace(/Tripulante (\d)/g, 'Crew member $1')
        .replace('Exames pré e pós-voo', 'Preflight and postflight lab results')
        .replace('Insights dos exames', 'Lab result insights')
        .replace('Parada cardíaca ·', 'Cardiac arrest ·');
    }
    return text.replace(core, translated);
  }
  function apply(root) {
    if (root.nodeType === 1 && root.closest('script,style,#language-selector')) return;
    if (root.nodeType === 3) {
      if (root.parentElement?.closest('script,style,#language-selector')) return;
      const current = root.textContent;
      const previous = originals.get(root);
      const source = previous && (current === previous.output || current === previous.source) ? previous.source : (reverse.get(current.trim()) || current);
      const output = locale === 'en' ? translate(source) : source;
      originals.set(root, {source, output});
      if (current !== output) root.textContent = output;
      return;
    }
    root.childNodes.forEach(apply);
  }
  selector.id = 'language-selector';
  async function load() {
    const responses = await Promise.all(['/locales/pt-BR.json','/locales/en.json'].map(async url => {
      const response = await fetch(url); if (!response.ok) throw Error('Translation unavailable'); return response.json();
    }));
    translations = new Map(Object.keys(responses[0]).map(key => [responses[0][key], responses[1][key]]));
    reverse = new Map([...translations].map(([pt,en]) => [en,pt]));
    document.documentElement.lang = locale;
    apply(document.body);
    new MutationObserver(records => records.forEach(record => {
      if (record.type === 'characterData') apply(record.target);
      else record.addedNodes.forEach(apply);
    })).observe(document.body, {subtree:true,childList:true,characterData:true});
    selector.querySelectorAll('button').forEach(button => {
      button.onclick = () => { locale = button.dataset.language; localStorage.setItem('sisp-language',locale); document.documentElement.lang = locale; updateButtons(); apply(document.body); };
    });
  }
  load().catch(console.error);
})();
