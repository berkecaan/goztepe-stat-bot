import { Chart, registerables } from 'chart.js';
import { createCanvas } from '@napi-rs/canvas';
import { DateTime } from 'luxon';
import { ranges } from '../utils/time.js';
Chart.register(...registerables);
export class ChartService {
  constructor(repo, settings) {
    this.repo = repo;
    this.settings = settings;
  }
  series(gid, metric, period, now = Date.now()) {
    const settings = this.settings.get(gid),
      zone = settings.timezone;
    const count = period === '7d' ? 7 : period === '30d' ? 30 : 24;
    const endDay = DateTime.fromMillis(ranges(settings, now).daily, { zone });
    const start =
      period === '24h'
        ? DateTime.fromMillis(now, { zone }).startOf('hour').minus({ hours: 23 })
        : endDay.minus({ days: count - 1 });
    const boundaries = Array.from({ length: count + 1 }, (_, n) =>
      (period === '24h'
        ? start.plus({ hours: n })
        : start.plus({ days: n }).startOf('day').set({ hour: settings.resetHour })
      ).toMillis(),
    );
    // Per-local-day boundaries intentionally handle daylight-saving changes.
    const labels = boundaries
      .slice(0, -1)
      .map((ts) =>
        DateTime.fromMillis(ts, { zone }).toFormat(period === '24h' ? 'HH:mm' : 'dd LLL'),
      );
    const values = boundaries.slice(0, -1).map((ts, n) => {
      const s = this.repo.aggregate(gid, { since: ts, until: boundaries[n + 1] });
      return metric === 'voice' ? Number((s.voiceMs / 3600000).toFixed(2)) : s.messages;
    });
    return {
      labels,
      values,
      title: metric === 'voice' ? 'Ses aktivitesi (saat)' : 'Mesaj aktivitesi',
      period,
    };
  }
  members(gid, now = Date.now()) {
    const zone = this.settings.get(gid).timezone;
    const start = DateTime.fromMillis(ranges(this.settings.get(gid), now).daily, { zone }).minus({
      days: 29,
    });
    const labels = [],
      joins = [],
      leaves = [];
    for (let n = 0; n < 30; n++) {
      const date = start
        .plus({ days: n })
        .startOf('day')
        .set({ hour: this.settings.get(gid).resetHour });
      const next = start
        .plus({ days: n + 1 })
        .startOf('day')
        .set({ hour: this.settings.get(gid).resetHour });
      const c = this.repo.memberCounts(gid, date.toMillis(), next.toMillis());
      labels.push(date.toFormat('dd LLL'));
      joins.push(c.joins);
      leaves.push(c.leaves);
    }
    return { labels, joins, leaves };
  }
  async render(data) {
    const canvas = createCanvas(1000, 500);
    const datasets = data.values
      ? [
          {
            label: data.title,
            data: data.values,
            borderColor: '#f0c44f',
            backgroundColor: '#f0c44f30',
            fill: true,
            tension: 0.3,
          },
        ]
      : [
          {
            label: 'Katılan',
            data: data.joins,
            borderColor: '#57d9a3',
            backgroundColor: '#57d9a330',
          },
          {
            label: 'Ayrılan',
            data: data.leaves,
            borderColor: '#ff6978',
            backgroundColor: '#ff697830',
          },
        ];
    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels: data.labels, datasets },
      options: {
        responsive: false,
        animation: false,
        devicePixelRatio: 1,
        layout: { padding: 25 },
        plugins: {
          title: {
            display: true,
            text: data.title || 'Üye hareketleri • Son 30 gün',
            color: '#f4f1e8',
            font: { size: 22 },
          },
          legend: { labels: { color: '#ddd' } },
        },
        scales: {
          x: { ticks: { color: '#b8c1d0', maxTicksLimit: 10 }, grid: { color: '#29313e' } },
          y: { beginAtZero: true, ticks: { color: '#b8c1d0' }, grid: { color: '#29313e' } },
        },
      },
      plugins: [
        {
          id: 'background',
          beforeDraw(c) {
            const x = c.ctx;
            x.save();
            x.globalCompositeOperation = 'destination-over';
            x.fillStyle = '#121821';
            x.fillRect(0, 0, c.width, c.height);
            x.restore();
          },
        },
      ],
    });
    try {
      return await canvas.encode('png');
    } finally {
      chart.destroy();
    }
  }
}
