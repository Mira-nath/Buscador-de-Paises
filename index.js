const API_KEY_COUNTRIES = 'rc_live_8a3e72b1e77745d79b085cdd0cf77de2';
const API_KEY_WEATHER = '7bab0e7a540ecf5526aab8aefbcf9ffc';

const input = document.getElementById('countryInput');
const resultContainer = document.getElementById('resultContainer');
const bottomFlagsGrid = document.getElementById('bottomFlagsGrid');

let todosLosPaises = [];
let dicBanderaPorNombre = {};
let dicIsoPorNombre = {};

// Bandera SVG de respaldo garantizada (nunca vacía, no depende de red externa)
const BANDERA_RESPALDO_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
    <rect width="320" height="200" fill="#1e293b"/>
    <circle cx="160" cy="100" r="52" fill="none" stroke="#38bdf8" stroke-width="6"/>
    <ellipse cx="160" cy="100" rx="24" ry="52" fill="none" stroke="#38bdf8" stroke-width="4"/>
    <line x1="108" y1="100" x2="212" y2="100" stroke="#38bdf8" stroke-width="4"/>
  </svg>
`);

function extraerIsoRecursivo(obj, profundidad = 0) {
  if (!obj || typeof obj !== 'object' || profundidad > 3) return '';

  const clavesDirectas = ['cca2', 'alpha2Code', 'iso2', 'iso_code', 'code'];
  for (const k of clavesDirectas) {
    const val = obj[k];
    if (typeof val === 'string' && /^[a-zA-Z]{2}$/.test(val.trim())) {
      return val.trim().toLowerCase();
    }
  }

  for (const key of Object.keys(obj)) {
    const encontrado = extraerIsoRecursivo(obj[key], profundidad + 1);
    if (encontrado) return encontrado;
  }
  return '';
}

function extraerUrlRecursivo(obj, profundidad = 0) {
  if (!obj || typeof obj !== 'object' || profundidad > 3) return '';

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      const limpio = val.trim();
      if (/^https?:\/\/.+\.(png|jpg|jpeg|webp|svg)(\?.*)?$/i.test(limpio) || limpio.includes('flag')) {
        return limpio;
      }
    } else if (val && typeof val === 'object') {
      const encontrada = extraerUrlRecursivo(val, profundidad + 1);
      if (encontrada) return encontrada;
    }
  }
  return '';
}

function obtenerBandera(pais) {
  if (!pais) return BANDERA_RESPALDO_SVG;

  const urlEnObjeto = extraerUrlRecursivo(pais.flags) || extraerUrlRecursivo(pais.flag) || extraerUrlRecursivo(pais);
  if (urlEnObjeto) return urlEnObjeto;

  const nombreKey = (pais.names?.common || pais.name?.common || '').trim().toLowerCase();
  if (nombreKey && dicBanderaPorNombre[nombreKey]) {
    return dicBanderaPorNombre[nombreKey];
  }

  const iso = extraerIsoRecursivo(pais) || (nombreKey ? dicIsoPorNombre[nombreKey] : '');
  if (iso && /^[a-z]{2}$/.test(iso)) {
    return `https://flagcdn.com/w320/${iso}.png`;
  }

  return BANDERA_RESPALDO_SVG;
}

function normalizarPais(p) {
  const nombreComun =
    p.names?.common ||
    p.name?.common ||
    (typeof p.name === 'string' ? p.name : '') ||
    'Desconocido';

  let capitales = [];
  if (Array.isArray(p.capitals)) {
    capitales = p.capitals;
  } else if (Array.isArray(p.capital)) {
    capitales = p.capital;
  } else if (typeof p.capital === 'string' && p.capital.trim()) {
    capitales = [p.capital.trim()];
  }

  const timezones = Array.isArray(p.timezones)
    ? p.timezones
    : Array.isArray(p.geography?.timezones)
      ? p.geography.timezones
      : [];

  return {
    ...p,
    names: { common: nombreComun },
    capitals: capitales,
    population: typeof p.population === 'number' ? p.population : Number(p.population) || 0,
    region: p.region || p.geography?.region || 'No disponible',
    subregion: p.subregion || p.geography?.subregion || 'No disponible',
    timezones: timezones,
    flags: p.flags || (p.flag ? { png: p.flag, svg: p.flag } : {})
  };
}

async function inicializarPaises() {
  if (resultContainer) {
    resultContainer.innerHTML = `<p class="message">Cargando países...</p>`;
  }

  try {
    const campos = 'names,capitals,population,geography,flag,flags,timezones,region,subregion,cca2,alpha2Code,codes';
    const headers = { 'Authorization': `Bearer ${API_KEY_COUNTRIES}` };

    const peticiones = [0, 100, 200].map(offset =>
      fetch(`https://api.restcountries.com/countries/v5?limit=100&offset=${offset}&response_fields=${campos}`, { headers })
        .then(async res => {
          if (!res.ok) {
            const detalle = await res.text().catch(() => '');
            throw new Error(`Error HTTP ${res.status}: ${detalle}`);
          }
          return res.json();
        })
    );

    const respuestas = await Promise.all(peticiones);
    const crudos = respuestas.flatMap(r => r.data?.objects || r.data || []);
    todosLosPaises = crudos.map(normalizarPais);

    if (!todosLosPaises.length) {
      throw new Error('La API devolvió una lista vacía.');
    }

    if (resultContainer) {
      resultContainer.innerHTML = `<div class="welcome-state"><p class="message">Escribe el nombre de un país para comenzar la búsqueda...</p></div>`;
    }
  } catch (error) {
    console.error("Error al obtener los países desde v5:", error);
    if (resultContainer) {
      resultContainer.innerHTML = `
        <p class="message">
          No se pudo cargar la lista de países desde la API (${error.message}).
          Revisa en tu cuenta de REST Countries si el dominio <strong>mira-nath.github.io</strong> está permitido o si tu plan/clave tiene restricciones en producción.
        </p>
      `;
    }
    if (bottomFlagsGrid) {
      bottomFlagsGrid.innerHTML = `<p class="message">No se pudieron cargar las banderas.</p>`;
    }
    return;
  }

  renderizarBanderasInferiores(todosLosPaises);
}

function renderizarBanderasInferiores(paises) {
  if (!bottomFlagsGrid) return;

  if (!paises.length) {
    bottomFlagsGrid.innerHTML = `<p class="message">No hay banderas disponibles.</p>`;
    return;
  }

  bottomFlagsGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  paises.forEach(pais => {
    const flagSrc = obtenerBandera(pais);
    const commonName = pais.names?.common || 'Desconocido';

    const item = document.createElement('div');
    item.className = 'mini-flag-item';
    item.title = commonName;
    item.innerHTML = `
      <img src="${flagSrc}" alt="Bandera de ${commonName}" loading="lazy" onerror="this.onerror=null;this.src='${BANDERA_RESPALDO_SVG}';">
      <span>${commonName}</span>
    `;

    item.addEventListener('click', () => {
      if (input) input.value = commonName;
      manejarResultados([pais]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    fragment.appendChild(item);
  });

  bottomFlagsGrid.appendChild(fragment);
}

function obtenerInfoHorariaPais(utcStr) {
  const ahora = new Date();
  const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60000;

  let offsetMinutos = 0;
  if (typeof utcStr === 'string') {
    const match = utcStr.match(/UTC([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (match) {
      const signo = match[1] === '-' ? -1 : 1;
      const horas = parseInt(match[2], 10) || 0;
      const minutos = parseInt(match[3], 10) || 0;
      offsetMinutos = signo * (horas * 60 + minutos);
    }
  }

  const fechaLocalPais = new Date(utcMs + offsetMinutos * 60000);
  const hora = fechaLocalPais.getHours();
  const minutosFormateados = String(fechaLocalPais.getMinutes()).padStart(2, '0');
  const horaFormateada = String(hora).padStart(2, '0');

  let franja = 'time-day';
  let etiquetaFranja = 'Día';

  if (hora >= 5 && hora < 8) {
    franja = 'time-dawn';
    etiquetaFranja = 'Amanecer';
  } else if (hora >= 8 && hora < 17) {
    franja = 'time-day';
    etiquetaFranja = 'Día';
  } else if (hora >= 17 && hora < 20) {
    franja = 'time-dusk';
    etiquetaFranja = 'Atardecer';
  } else {
    franja = 'time-night';
    etiquetaFranja = 'Noche';
  }

  return { horaTexto: `${horaFormateada}:${minutosFormateados}`, franja, etiquetaFranja };
}

function aplicarTemaPorHora(claseTema) {
  document.body.classList.remove('time-default', 'time-dawn', 'time-day', 'time-dusk', 'time-night');
  document.body.classList.add(claseTema || 'time-default');
}

if (input) {
  input.addEventListener('input', (e) => {
    const textoBusqueda = e.target.value.trim().toLowerCase();

    if (textoBusqueda === '') {
      aplicarTemaPorHora('time-default');
      if (resultContainer) {
        resultContainer.innerHTML = `<div class="welcome-state"><p class="message">Escribe el nombre de un país para comenzar la búsqueda...</p></div>`;
      }
      return;
    }

    if (todosLosPaises.length === 0) {
      if (resultContainer) {
        resultContainer.innerHTML = `<p class="message">La lista de países está cargando. Intenta de nuevo en un segundo.</p>`;
      }
      return;
    }

    const paisesFiltrados = todosLosPaises.filter(pais => {
      const nombreComun = pais.names?.common || '';
      return nombreComun.toLowerCase().includes(textoBusqueda);
    });

    manejarResultados(paisesFiltrados);
  });
}

function manejarResultados(paises) {
  if (!resultContainer) return;
  resultContainer.innerHTML = '';

  if (paises.length > 10) {
    aplicarTemaPorHora('time-default');
    resultContainer.innerHTML = `<p class="message">Demasiados paises, especifica mejor tu busqueda</p>`;
    return;
  }

  if (paises.length > 1 && paises.length <= 10) {
    aplicarTemaPorHora('time-default');
    const grid = document.createElement('div');
    grid.className = 'countries-grid';

    paises.forEach(pais => {
      const flagSrc = obtenerBandera(pais);
      const commonName = pais.names?.common || 'Desconocido';

      const card = document.createElement('div');
      card.className = 'country-card';
      card.innerHTML = `
        <img src="${flagSrc}" alt="Bandera de ${commonName}" loading="lazy" onerror="this.onerror=null;this.src='${BANDERA_RESPALDO_SVG}';">
        <h3>${commonName}</h3>
      `;

      card.addEventListener('click', () => {
        if (input) input.value = commonName;
        manejarResultados([pais]);
      });

      grid.appendChild(card);
    });

    resultContainer.appendChild(grid);
    return;
  }

  if (paises.length === 1) {
    const pais = paises[0];
    const commonName = pais.names?.common || 'Desconocido';
    const flagSrc = obtenerBandera(pais);

    let capital = 'No disponible';
    if (pais.capitals && pais.capitals.length > 0) {
      const capObj = pais.capitals[0];
      capital = (typeof capObj === 'object' && capObj !== null)
        ? (capObj.name || capObj.common || Object.values(capObj)[0])
        : capObj;
    }

    const habitantes = pais.population ? pais.population.toLocaleString() : 'No disponible';
    const region = pais.region || pais.geography?.region || 'No disponible';
    const subregion = pais.subregion || pais.geography?.subregion || 'No disponible';
    const utc = pais.timezones && pais.timezones.length > 0 ? pais.timezones[0] : 'UTC+00:00';

    const infoHora = obtenerInfoHorariaPais(utc);
    aplicarTemaPorHora(infoHora.franja);

    resultContainer.innerHTML = `
      <div class="country-detail-card">
        <div class="country-flag-side">
          <img src="${flagSrc}" alt="Bandera de ${commonName}" onerror="this.onerror=null;this.src='${BANDERA_RESPALDO_SVG}';">
          <div id="weatherBox" class="weather-box">
            <p>Cargando clima...</p>
          </div>
        </div>
        <div class="country-info-side">
          <h2>${commonName}</h2>
          <p><strong>Capital:</strong> ${capital}</p>
          <p><strong>Habitantes:</strong> ${habitantes} habitantes</p>
          <p><strong>Región:</strong> ${region}</p>
          <p><strong>Subregión:</strong> ${subregion}</p>
          <p><strong>UTC:</strong> ${utc}</p>
          <div class="local-time-badge">
            Hora local aprox.: <strong>${infoHora.horaTexto}</strong> (${infoHora.etiquetaFranja})
          </div>
        </div>
      </div>
    `;

    const weatherBoxEl = document.getElementById('weatherBox');
    if (capital !== 'No disponible') {
      obtenerClima(capital);
    } else if (weatherBoxEl) {
      weatherBoxEl.innerHTML = `<p>Clima no disponible</p>`;
    }
    return;
  }

  if (paises.length === 0) {
    aplicarTemaPorHora('time-default');
    resultContainer.innerHTML = `<p class="message">No se encontró ningún país con ese nombre.</p>`;
  }
}

async function obtenerClima(ciudad) {
  const weatherBox = document.getElementById('weatherBox');
  if (!weatherBox) return;

  try {
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(ciudad)}&units=metric&appid=${API_KEY_WEATHER}&lang=es`);
    const data = await response.json();

    if (response.ok) {
      const temp = Math.round(data.main.temp);
      const descripcion = data.weather[0].description;
      const icono = data.weather[0].icon;

      weatherBox.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          <img src="https://openweathermap.org/img/wn/${icono}.png" alt="icono clima" style="width: 40px; height: 40px;">
          <span style="font-size: 1.1rem; font-weight: 700; color: #f8fafc;">${temp} °C</span>
        </div>
        <p style="font-size: 0.85rem; color: #94a3b8; text-transform: capitalize;">${descripcion}</p>
      `;
    } else {
      weatherBox.innerHTML = `<p style="font-size: 0.85rem; color: #94a3b8;">Clima no disponible</p>`;
    }
  } catch (error) {
    console.error("Error al obtener el clima:", error);
    weatherBox.innerHTML = `<p style="font-size: 0.85rem; color: #94a3b8;">Error al cargar clima</p>`;
  }
}

inicializarPaises();