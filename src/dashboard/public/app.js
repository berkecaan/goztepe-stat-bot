'use strict';
const $ = (s) => document.querySelector(s),
  content = $('#content');
let csrf = '',
  guildId = '',
  page = 'overview',
  offset = 0,
  leaderPeriod = 'all',
  charts = [],
  generation = 0;
const n = (v) => Number(v || 0).toLocaleString('tr-TR');
const duration = (ms) => `${n(Math.floor(ms / 3600000))} sa ${Math.floor(ms / 60000) % 60} dk`;
const titles = {
  overview: 'Genel bakış',
  members: 'Üyeler',
  channels: 'Kanallar',
  leaderboards: 'Liderlik tablosu',
  activity: 'Aktivite',
  settings: 'Ayarlar',
};
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function notice(message) {
  $('#notice').hidden = !message;
  $('#notice').textContent = message || '';
}
async function api(path, options = {}) {
  const r = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers },
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401) {
      $('#shell').hidden = true;
      $('#login').hidden = false;
    }
    throw new Error(data.error || 'Bağlantı hatası.');
  }
  return data;
}
function panel(title, parent = content) {
  const p = el('section', undefined, 'panel');
  p.append(el('h2', title));
  parent.append(p);
  return p;
}
function table(parent, rows, metric = 'messages', start = 0) {
  if (!rows.length) {
    parent.append(
      el('p', 'Henüz aktivite kaydı yok. Bot kayıt yapmaya başladıkça burada görünecek.', 'empty'),
    );
    return;
  }
  const wrap = el('div', undefined, 'table-wrap'),
    t = el('table'),
    head = el('tr');
  for (const name of ['#', 'Üye / Kanal', metric === 'voice' ? 'Ses süresi' : 'Mesaj'])
    head.append(el('th', name));
  const thead = el('thead');
  thead.append(head);
  t.append(thead);
  const body = el('tbody');
  rows.forEach((r, index) => {
    const row = el('tr');
    row.append(
      el('td', String(start + index + 1)),
      el('td', r.name || r.id),
      el('td', metric === 'voice' ? duration(r.value) : n(r.value)),
    );
    body.append(row);
  });
  t.append(body);
  wrap.append(t);
  parent.append(wrap);
}
function chart(parent, data) {
  const wrap = el('div', undefined, 'chart-wrap'),
    canvas = el('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', data.title || 'Son 30 gün katılan ve ayrılan üyeler');
  wrap.append(canvas);
  parent.append(wrap);
  const datasets = data.values
    ? [
        {
          label: data.title,
          data: data.values,
          borderColor: '#f0c44f',
          backgroundColor: '#f0c44f16',
          fill: true,
          tension: 0.35,
          pointRadius: 2,
        },
      ]
    : [
        { label: 'Katılan', data: data.joins, borderColor: '#57d9a3', pointRadius: 1 },
        { label: 'Ayrılan', data: data.leaves, borderColor: '#ff6978', pointRadius: 1 },
      ];
  charts.push(
    new Chart(canvas, {
      type: 'line',
      data: { labels: data.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: !data.values, labels: { color: '#adb8c8' } } },
        scales: {
          x: { ticks: { color: '#939eaf', maxTicksLimit: 8 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: '#939eaf' }, grid: { color: '#29313e' } },
        },
      },
    }),
  );
}
function select(values) {
  const s = el('select');
  for (const [value, name] of values) {
    const o = el('option', name);
    o.value = value;
    s.append(o);
  }
  return s;
}
function pager(more, size = 50) {
  const div = el('div', undefined, 'pager'),
    prev = el('button', '← Önceki'),
    next = el('button', 'Sonraki →');
  prev.disabled = offset === 0;
  next.disabled = !more;
  prev.onclick = () => {
    offset = Math.max(0, offset - size);
    load();
  };
  next.onclick = () => {
    offset += size;
    load();
  };
  div.append(prev, next);
  content.append(div);
}
async function load() {
  const id = ++generation;
  charts.forEach((c) => c.destroy());
  charts = [];
  content.replaceChildren(el('p', 'Veriler yükleniyor…', 'empty'));
  notice('');
  $('#page-title').textContent = titles[page];
  document
    .querySelectorAll('nav button')
    .forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  if (!guildId) {
    content.replaceChildren(
      el(
        'p',
        'Botun bulunduğu ve yönetme yetkinizin olduğu bir sunucu görünmüyor. Botu sunucunuza ekleyip yeniden giriş yapın.',
        'empty',
      ),
    );
    return;
  }
  const root = `/guilds/${guildId}`;
  try {
    const data = await api(
      `${root}/${page}${page === 'members' || page === 'leaderboards' ? `?offset=${offset}&period=${leaderPeriod}` : ''}`,
    );
    if (id !== generation) return;
    content.replaceChildren();
    if (page === 'overview') {
      const s = data.summary,
        cards = el('div', undefined, 'cards');
      for (const [label, value, detail] of [
        ['Toplam üye', n(s.members), `${n(s.active)} aktif · ${n(s.bots)} bot`],
        ['Toplam mesaj', n(s.total.messages), `${n(s.last24.messages)} son 24 saatte`],
        ['Toplam ses', duration(s.total.voiceMs), `${duration(s.last24.voiceMs)} son 24 saatte`],
        [
          '7 gün değişimi',
          s.change === null ? '—' : `${s.change > 0 ? '+' : ''}${s.change}%`,
          `${n(s.last7.messages)} mesaj · önceki 7 güne göre`,
        ],
      ]) {
        const card = el('div', undefined, 'card accent');
        card.append(el('p', label), el('strong', value), el('small', detail));
        cards.append(card);
      }
      content.append(cards);
      chart(panel('Mesaj trafiği · Son 7 gün'), data.chart);
      chart(panel('Topluluğun büyümesi · Son 30 gün'), data.members);
    } else if (page === 'members') {
      table(panel('Mesaj aktivitesine göre üyeler'), data.rows, 'messages', offset);
      pager(data.more);
    } else if (page === 'channels' || page === 'leaderboards') {
      let host = el('div', undefined, 'grid-2');
      if (page === 'leaderboards') {
        const toolbar = el('div', undefined, 'toolbar'),
          period = select([
            ['all', 'Tüm zamanlar'],
            ['7d', 'Son 7 gün'],
            ['30d', 'Son 30 gün'],
          ]);
        period.value = leaderPeriod;
        period.setAttribute('aria-label', 'Sıralama dönemi');
        toolbar.append(period);
        content.append(toolbar);
        period.onchange = () => {
          leaderPeriod = period.value;
          offset = 0;
          load();
        };
      }
      content.append(host);
      table(panel('Mesaj aktivitesi', host), data.messages, 'messages', offset);
      table(panel('Ses aktivitesi', host), data.voice, 'voice', offset);
      if (page === 'leaderboards')
        pager(data.messages.length === data.size || data.voice.length === data.size, data.size);
    } else if (page === 'activity') {
      const toolbar = el('div', undefined, 'toolbar'),
        metric = select([
          ['messages', 'Mesaj'],
          ['voice', 'Ses'],
        ]),
        period = select([
          ['7d', 'Son 7 gün'],
          ['30d', 'Son 30 gün'],
          ['24h', 'Saatlik · Son 24 saat'],
        ]);
      metric.setAttribute('aria-label', 'Metrik');
      period.setAttribute('aria-label', 'Dönem');
      toolbar.append(metric, period);
      content.append(toolbar);
      const p = panel('Aktivite eğrisi');
      chart(p, data);
      const update = async () => {
        try {
          const d = await api(`${root}/activity?type=${metric.value}&period=${period.value}`);
          if (id !== generation) return;
          charts.forEach((c) => c.destroy());
          charts = [];
          p.replaceChildren(el('h2', d.title));
          chart(p, d);
        } catch (e) {
          notice(e.message);
        }
      };
      metric.onchange = period.onchange = update;
    } else if (page === 'settings') renderSettings(data, root);
  } catch (e) {
    if (id !== generation) return;
    content.replaceChildren();
    notice(e.message);
  }
}
function renderSettings(s, root) {
  const p = panel('Sunucu tercihleri'),
    form = el('form', undefined, 'settings-form'),
    inputs = {};
  const fields = [
    ['timezone', 'Saat dilimi', 'text'],
    ['resetHour', 'Gün başlangıcı (0–23)', 'number'],
    ['leaderboardSize', 'Sıralama boyutu', 'size'],
    ['countBots', 'Bot mesajlarını ve sesini say', 'bool'],
    ['dashboardEnabled', 'Dashboard açık', 'bool'],
    ['excludedChannels', 'Hariç kanal ID’leri (virgülle)', 'text'],
    ['excludedRoles', 'Hariç rol ID’leri (virgülle)', 'text'],
  ];
  for (const [key, title, type] of fields) {
    const label = el('label', title);
    let input;
    if (type === 'bool')
      input = select([
        ['true', 'Açık'],
        ['false', 'Kapalı'],
      ]);
    else if (type === 'size')
      input = select([
        ['10', '10'],
        ['20', '20'],
      ]);
    else {
      input = el('input');
      input.type = type;
      if (type === 'number') {
        input.min = '0';
        input.max = '23';
      }
    }
    input.value = Array.isArray(s[key]) ? s[key].join(',') : String(s[key]);
    inputs[key] = input;
    label.append(input);
    form.append(label);
  }
  const label = el('label', 'Aktivite eşikleri (JSON)', 'wide'),
    area = el('textarea');
  area.value = JSON.stringify(s.activityThresholds, null, 2);
  inputs.activityThresholds = area;
  label.append(area);
  form.append(label);
  const note = el(
    'p',
    '1 mesaj = 1 puan, 5 dakika ses = 1 puan. Hariç tutma geçmiş kayıtları silmez. Dashboard’u kapatırsanız yalnızca Discord /settings komutuyla yeniden açabilirsiniz.',
    'hint wide',
  );
  form.append(note);
  const save = el('button', 'Ayarları kaydet', 'primary');
  save.type = 'submit';
  form.append(save);
  p.append(form);
  form.onsubmit = async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const patch = {};
      for (const [key, input] of Object.entries(inputs)) {
        if (key === 'countBots' || key === 'dashboardEnabled') patch[key] = input.value === 'true';
        else if (key === 'resetHour' || key === 'leaderboardSize') patch[key] = Number(input.value);
        else if (key === 'excludedChannels' || key === 'excludedRoles')
          patch[key] = input.value
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        else if (key === 'activityThresholds') patch[key] = JSON.parse(input.value);
        else patch[key] = input.value;
      }
      await api(`${root}/settings`, { method: 'PATCH', body: JSON.stringify(patch) });
      notice('Ayarlar kaydedildi.');
    } catch (e) {
      notice(e.message);
    } finally {
      save.disabled = false;
    }
  };
}
document.querySelectorAll('nav button').forEach(
  (b) =>
    (b.onclick = () => {
      page = b.dataset.page;
      offset = 0;
      load();
    }),
);
$('#guild').onchange = () => {
  guildId = $('#guild').value;
  $('#guild-name').textContent = $('#guild').selectedOptions[0]?.textContent || '';
  offset = 0;
  load();
};
$('#logout').onclick = async () => {
  try {
    await api('/logout', { method: 'POST' });
    location.reload();
  } catch (e) {
    notice(e.message);
  }
};
(async () => {
  try {
    const me = await api('/me');
    csrf = me.csrf;
    $('#username').textContent = me.user.name;
    const guilds = await api('/guilds');
    for (const g of guilds) {
      const o = el('option', g.name + (g.enabled ? '' : ' (kapalı)'));
      o.value = g.id;
      $('#guild').append(o);
    }
    guildId = guilds[0]?.id || '';
    $('#guild-name').textContent = guilds[0]?.name || '';
    $('#login').hidden = true;
    $('#shell').hidden = false;
    await load();
  } catch (e) {
    if (!$('#shell').hidden) notice(e.message);
  }
})();
