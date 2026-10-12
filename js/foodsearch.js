// Food lookup: Open Food Facts (search + barcode) and a built-in list of common foods.
(function () {
  const S = () => Store.state;
  const $ = (sel) => document.querySelector(sel);
  const OFF = 'https://world.openfoodfacts.org';
  const OFF_SEARCH = 'https://search.openfoodfacts.org/search';
  const FIELDS = 'code,product_name,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,nutriments,image_front_small_url,countries_tags';

  const REGIONS = {
    world: { label: 'Worldwide', tag: null, sub: 'world' },
    uk: { label: 'United Kingdom', tag: 'en:united-kingdom', sub: 'uk' },
    ie: { label: 'Ireland', tag: 'en:ireland', sub: 'ie' },
    us: { label: 'United States', tag: 'en:united-states', sub: 'us' },
    ca: { label: 'Canada', tag: 'en:canada', sub: 'ca' },
    au: { label: 'Australia', tag: 'en:australia', sub: 'au' },
    nz: { label: 'New Zealand', tag: 'en:new-zealand', sub: 'nz' },
    fr: { label: 'France', tag: 'en:france', sub: 'fr' },
    de: { label: 'Germany', tag: 'en:germany', sub: 'de' },
    es: { label: 'Spain', tag: 'en:spain', sub: 'es' },
    it: { label: 'Italy', tag: 'en:italy', sub: 'it' },
    nl: { label: 'Netherlands', tag: 'en:netherlands', sub: 'nl' },
  };

  // Typical values per 100 g (approximate). [name, kcal, protein, carbs, fat, servingGrams?, servingLabel?]
  const COMMON = [
    ['Chicken breast, raw', 106, 24, 0, 1.1],
    ['Chicken breast, cooked', 148, 32, 0, 2.2],
    ['Beef mince 5% fat, raw', 124, 21, 0, 5],
    ['Beef mince 20% fat, raw', 254, 17, 0, 20],
    ['Salmon fillet, raw', 208, 20, 0, 13],
    ['Tuna, canned in water, drained', 116, 26, 0, 1],
    ['Egg, whole', 143, 12.6, 0.7, 9.5, 50, '1 large egg'],
    ['Tofu, firm', 144, 17, 2.8, 8.7],
    ['White rice, cooked', 130, 2.7, 28, 0.3],
    ['White rice, uncooked', 360, 7, 79, 0.6],
    ['Brown rice, cooked', 123, 2.7, 25.6, 1],
    ['Pasta, cooked', 158, 5.8, 31, 0.9],
    ['Pasta, dry', 357, 12.5, 72, 1.5],
    ['Oats, rolled', 379, 13, 66, 7, 40, '40 g portion'],
    ['Potato, boiled', 87, 1.9, 20, 0.1],
    ['Sweet potato, baked', 90, 2, 20.7, 0.2],
    ['Bread, white', 265, 9, 49, 3.2, 36, '1 slice'],
    ['Bread, wholemeal', 247, 12.5, 42, 3.4, 36, '1 slice'],
    ['Lentils, cooked', 116, 9, 20, 0.4],
    ['Chickpeas, cooked', 164, 8.9, 27.4, 2.6],
    ['Baked beans in tomato sauce', 84, 5, 13, 0.4],
    ['Banana', 89, 1.1, 22.8, 0.3, 118, '1 medium'],
    ['Apple', 52, 0.3, 13.8, 0.2, 182, '1 medium'],
    ['Orange', 47, 0.9, 11.8, 0.1, 130, '1 medium'],
    ['Blueberries', 57, 0.7, 14.5, 0.3],
    ['Strawberries', 32, 0.7, 7.7, 0.3],
    ['Avocado', 160, 2, 8.5, 14.7, 100, '½ avocado'],
    ['Broccoli', 34, 2.8, 6.6, 0.4],
    ['Spinach', 23, 2.9, 3.6, 0.4],
    ['Carrot', 41, 0.9, 9.6, 0.2],
    ['Milk, semi-skimmed', 46, 3.5, 4.8, 1.7, 250, '1 glass (250 ml)'],
    ['Milk, whole', 64, 3.3, 4.7, 3.6, 250, '1 glass (250 ml)'],
    ['Greek yogurt, 0% fat', 59, 10.3, 3.6, 0.4],
    ['Cheddar cheese', 403, 25, 1.3, 33, 30, '30 g portion'],
    ['Peanut butter', 588, 25, 20, 50, 15, '1 tbsp'],
    ['Almonds', 579, 21, 22, 50, 30, 'small handful'],
    ['Olive oil', 884, 0, 0, 100, 13.5, '1 tbsp'],
    ['Butter', 717, 0.9, 0.1, 81, 10, '1 tsp'],
    ['Whey protein powder (typical)', 400, 80, 8, 6, 30, '1 scoop'],
  ].map(([name, kcal, p, c, f, servingG, servingLabel]) => ({
    name,
    brand: 'Common food',
    per100: { kcal, p, c, f },
    servingG: servingG || null,
    servingLabel: servingLabel || null,
    common: true,
  }));

  let picked = null; // the food currently in the portion picker
  let scanner = null; // {stream, stop()}

  // ---------- Open Food Facts ----------
  const region = () => REGIONS[S().foodRegion] || REGIONS.world;

  function normalise(p) {
    if (!p) return null;
    const n = p.nutriments || {};
    let kcal = n['energy-kcal_100g'];
    if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184; // kJ → kcal
    if (kcal == null) return null;
    const brand = Array.isArray(p.brands) ? p.brands[0] : (p.brands || '').split(',')[0];
    const servingG = parseFloat(p.serving_quantity);
    return {
      code: p.code,
      name: (p.product_name || p.product_name_en || p.generic_name || 'Unnamed product').trim(),
      brand: (brand || '').trim(),
      quantity: p.quantity || '',
      image: p.image_front_small_url || '',
      per100: {
        kcal: Util.round(Number(kcal), 0),
        p: Util.round(Number(n.proteins_100g) || 0, 1),
        c: Util.round(Number(n.carbohydrates_100g) || 0, 1),
        f: Util.round(Number(n.fat_100g) || 0, 1),
      },
      servingG: servingG > 0 ? servingG : null,
      servingLabel: p.serving_size || null,
      countries: p.countries_tags || [],
    };
  }

  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function lookupBarcode(code) {
    const data = await getJSON(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
    return data.status === 1 ? normalise(data.product) : null;
  }

  async function searchOFF(q) {
    const r = region();
    let products;
    try {
      const data = await getJSON(`${OFF_SEARCH}?q=${encodeURIComponent(q)}&page_size=24&fields=${FIELDS}`);
      products = data.hits || [];
    } catch (e) {
      // Fallback: the classic search, limited to the chosen country
      const data = await getJSON(
        `https://${r.sub}.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}`
      );
      products = data.products || [];
    }
    const out = products.map(normalise).filter(Boolean);
    // Products sold in your country first
    if (r.tag) out.sort((a, b) => b.countries.includes(r.tag) - a.countries.includes(r.tag));
    return out;
  }

  function searchCommon(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return COMMON.filter((f) => words.every((w) => f.name.toLowerCase().includes(w)));
  }

  // ---------- Results ----------
  function resultRow(f, i) {
    return `<button type="button" class="food-result" data-pick="${i}">
      ${f.image ? `<img src="${Util.esc(f.image)}" alt="" loading="lazy">` : `<span class="food-thumb">${f.common ? '🥦' : '🛒'}</span>`}
      <span class="fr-text"><b>${Util.esc(f.name)}</b>
        <span class="muted small">${Util.esc([f.brand, f.quantity].filter(Boolean).join(' · '))}</span></span>
      <span class="fr-kcal"><b>${f.per100.kcal}</b><span class="muted small">kcal/100g</span></span>
    </button>`;
  }

  let lastResults = [];
  function showResults(list, note = '') {
    lastResults = list;
    const box = $('#food-results');
    box.hidden = false;
    box.innerHTML =
      (note ? `<div class="muted small fr-note">${note}</div>` : '') +
      (list.length ? list.map(resultRow).join('') : '<div class="muted small fr-note">No matches. Try different words, or enter it manually below.</div>');
  }

  async function runSearch() {
    const q = $('#food-search').value.trim();
    if (q.length < 2) return;
    clearPick();
    const common = searchCommon(q);
    showResults(common, 'Searching Open Food Facts…');
    try {
      const found = await searchOFF(q);
      showResults([...common, ...found], found.length || common.length ? '' : '');
    } catch (e) {
      console.warn('Food search failed', e);
      showResults(common, navigator.onLine ? 'Could not reach the food database. Showing common foods only.' : "You're offline. Showing common foods only.");
    }
  }

  // ---------- Portion picker ----------
  function pick(f) {
    picked = f;
    $('#food-results').hidden = true;
    const box = $('#food-pick');
    box.hidden = false;
    const units = [`<option value="g">grams</option>`];
    if (f.servingG) units.unshift(`<option value="serving">${Util.esc(f.servingLabel || 'serving')} (${Util.round(f.servingG, 1)} g)</option>`);
    box.innerHTML = `
      <div class="pick-head">
        ${f.image ? `<img src="${Util.esc(f.image)}" alt="">` : `<span class="food-thumb">${f.common ? '🥦' : '🛒'}</span>`}
        <div class="fr-text"><b>${Util.esc(f.name)}</b><span class="muted small">${Util.esc([f.brand, f.quantity].filter(Boolean).join(' · '))}</span>
          <span class="muted small">Per 100 g: ${f.per100.kcal} kcal · P ${f.per100.p}g · C ${f.per100.c}g · F ${f.per100.f}g</span></div>
        <button type="button" class="icon-btn" id="pick-clear" title="Clear">✕</button>
      </div>
      <div class="row gap wrap pick-portion">
        <label>Amount<input id="pick-amount" type="number" min="0" step="any" value="${f.servingG ? 1 : 100}"></label>
        <label>Unit<select id="pick-unit">${units.join('')}</select></label>
        <div class="pick-total" id="pick-total"></div>
      </div>
      <p class="muted small">Check the numbers match the packet, and edit them below if needed.${f.common ? ' Common foods use typical values.' : ''}</p>`;
    $('#pick-unit').onchange = () => {
      $('#pick-amount').value = $('#pick-unit').value === 'serving' ? 1 : f.servingG ? Util.round(f.servingG, 0) : 100;
      applyPortion();
    };
    $('#pick-amount').oninput = applyPortion;
    $('#pick-clear').onclick = clearPick;
    applyPortion();
    $('#pick-amount').focus();
    $('#pick-amount').select();
  }

  function applyPortion() {
    if (!picked) return;
    const amount = Util.num($('#pick-amount').value);
    const grams = $('#pick-unit').value === 'serving' ? amount * picked.servingG : amount;
    const k = grams / 100;
    const v = {
      calories: Util.round(picked.per100.kcal * k, 0),
      protein: Util.round(picked.per100.p * k, 1),
      carbs: Util.round(picked.per100.c * k, 1),
      fat: Util.round(picked.per100.f * k, 1),
    };
    const label = `${picked.name}${picked.brand && !picked.common ? ` (${picked.brand})` : ''} · ${Util.round(grams, 0)}g`;
    $('#food-name').value = label;
    $('#food-cal').value = v.calories;
    $('#food-p').value = v.protein;
    $('#food-c').value = v.carbs;
    $('#food-f').value = v.fat;
    $('#food-servings').value = 1;
    $('#pick-total').innerHTML = `<b>${v.calories} kcal</b><span class="muted small">P ${v.protein} · C ${v.carbs} · F ${v.fat}</span>`;
  }

  function clearPick() {
    picked = null;
    $('#food-pick').hidden = true;
    $('#food-pick').innerHTML = '';
  }

  // ---------- Barcode scanner ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function nativeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => formats.includes(f));
      return want.length ? new window.BarcodeDetector({ formats: want }) : null;
    } catch (e) {
      return null;
    }
  }

  let hintTimer = null;
  let lookingUp = false;

  function scanMsg(text) {
    $('#scan-msg').textContent = text;
  }

  // Show the "type the barcode" section. focus=true also opens the keyboard.
  function showManual(focus = true) {
    $('#scan-manual').hidden = false;
    $('#scan-manual-toggle').hidden = true;
    $('#manual-entry').classList.add('open');
    if (focus) $('#scan-code').focus();
  }

  function stopCamera() {
    clearTimeout(hintTimer);
    if (scanner) scanner.stop();
    scanner = null;
    const video = $('#scan-video');
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  }

  async function openScanner() {
    const video = $('#scan-video');
    $('#scan-modal').hidden = false;
    $('#scan-result').hidden = true;
    $('#scan-view').hidden = false;
    $('#scan-code').value = '';
    $('#scan-code-msg').textContent = '';
    $('#scan-manual').hidden = true;
    $('#scan-manual-toggle').hidden = false;
    $('#manual-entry').classList.remove('open');
    lookingUp = false;
    scanMsg('Starting camera…');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      scanMsg(location.protocol === 'file:' ? 'The camera only works on the online version of the site. Type the barcode below.' : "This browser can't use the camera. Type the barcode below.");
      $('#scan-view').hidden = true;
      return showManual();
    }
    const constraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
    try {
      const detector = await nativeDetector();
      if (detector) {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play();
        let running = true;
        scanner = {
          stop() {
            running = false;
            stream.getTracks().forEach((t) => t.stop());
          },
        };
        const loop = async () => {
          if (!running) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length) return found(codes[0].rawValue);
          } catch (e) {
            /* frame not ready */
          }
          setTimeout(loop, 150);
        };
        loop();
      } else {
        if (!window.ZXing) await loadScript('js/vendor/zxing.min.js');
        const hints = new Map();
        const F = window.ZXing.BarcodeFormat;
        hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]);
        const reader = new window.ZXing.BrowserMultiFormatReader(hints, 200);
        scanner = { stop: () => reader.reset() };
        await reader.decodeFromConstraints(constraints, video, (result) => {
          if (result) found(result.getText());
        });
      }
      scanMsg('Point the camera at the barcode, holding it steady inside the box.');
      // Still nothing after a while? Offer typing it in.
      hintTimer = setTimeout(() => {
        if (lookingUp || $('#scan-modal').hidden) return;
        scanMsg("Having trouble? Try more light or move a little further away, or type the number below.");
        showManual(false);
      }, 8000);
    } catch (e) {
      console.warn('Scanner error', e);
      stopCamera();
      $('#scan-view').hidden = true;
      scanMsg(
        e && e.name === 'NotAllowedError'
          ? 'Camera access was blocked. You can allow it in your browser settings, or type the barcode below.'
          : "Couldn't start the camera. Type the barcode below."
      );
      showManual();
    }
  }

  function closeScanner() {
    stopCamera();
    lookingUp = false;
    $('#scan-modal').hidden = true;
  }

  // Check a typed barcode: right length and a valid check digit (EAN/UPC/GTIN).
  function barcodeProblem(code) {
    if (!code) return 'Type the numbers under the barcode.';
    if (![8, 12, 13, 14].includes(code.length)) return `That's ${code.length} digits. Barcodes usually have 8, 12 or 13. Check you've typed them all.`;
    const digits = code.split('').map(Number);
    const check = digits.pop();
    const sum = digits.reverse().reduce((t, d, i) => t + d * (i % 2 === 0 ? 3 : 1), 0);
    if ((10 - (sum % 10)) % 10 !== check) return "That number doesn't look right. A digit may be mistyped, so please check it.";
    return null;
  }

  function showResult(html, buttons) {
    const box = $('#scan-result');
    box.hidden = false;
    box.innerHTML = `<p>${html}</p><div class="row gap wrap">${buttons
      .map((b, i) => `<button type="button" class="btn small ${i === 0 ? 'primary' : ''}" data-act="${b[0]}">${b[1]}</button>`)
      .join('')}</div>`;
  }

  async function found(code) {
    if (lookingUp) return;
    lookingUp = true;
    stopCamera();
    if (navigator.vibrate) navigator.vibrate(60);
    $('#scan-result').hidden = true;
    scanMsg(`Looking up ${code}…`);
    try {
      const product = await lookupBarcode(code);
      if (product) {
        closeScanner();
        pick(product);
        App.toast(`Found: ${product.name}`);
        return;
      }
      scanMsg('');
      showResult(`<b>${Util.esc(code)}</b> isn't in the food database yet.`, [
        ['manual-food', 'Add it manually'],
        ['retype', 'Type a different number'],
        ['rescan', 'Scan again'],
      ]);
    } catch (e) {
      console.warn('Barcode lookup failed', e);
      scanMsg('');
      showResult("Couldn't reach the food database. Check your internet connection.", [
        ['retry:' + code, 'Try again'],
        ['manual-food', 'Add it manually'],
      ]);
    }
    lookingUp = false;
    $('#scan-view').hidden = true;
    showManual(false);
  }

  // ---------- Init ----------
  function render() {
    const sel = $('#set-food-region');
    if (sel) {
      if (!sel.options.length) sel.innerHTML = Object.entries(REGIONS).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('');
      sel.value = S().foodRegion || 'world';
    }
  }

  function init() {
    $('#food-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // don't submit the add-food form
        runSearch();
      }
    });
    $('#food-search-btn').onclick = runSearch;
    $('#food-scan-btn').onclick = openScanner;
    $('#scan-close').onclick = closeScanner;
    $('#scan-modal').addEventListener('click', (e) => e.target.id === 'scan-modal' && closeScanner());
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#scan-modal').hidden && closeScanner());
    $('#scan-manual-toggle').onclick = () => showManual(true);
    $('#scan-code').addEventListener('input', () => ($('#scan-code-msg').textContent = ''));
    $('#scan-manual').onsubmit = (e) => {
      e.preventDefault();
      const code = $('#scan-code').value.replace(/\D/g, '');
      const problem = barcodeProblem(code);
      const msg = $('#scan-code-msg');
      msg.textContent = problem || '';
      msg.classList.toggle('bad', !!problem);
      if (!problem) found(code);
    };
    $('#scan-result').onclick = (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'manual-food') {
        closeScanner();
        $('#food-name').focus();
      } else if (a === 'retype') {
        $('#scan-result').hidden = true;
        $('#scan-code').value = '';
        showManual(true);
      } else if (a === 'rescan') openScanner();
      else if (a.startsWith('retry:')) found(a.slice(6));
    };
    $('#food-results').onclick = (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) pick(lastResults[Number(b.dataset.pick)]);
    };
    $('#food-form').addEventListener('reset', () => {
      clearPick();
      $('#food-results').hidden = true;
      setTimeout(() => ($('#food-search').value = ''), 0);
    });
    render();
  }

  window.FoodSearch = { init, render, normalise, searchCommon, barcodeProblem };
})();
