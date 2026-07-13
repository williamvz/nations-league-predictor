// Render the leaderboard as a WhatsApp-ready image, fully client-side
// (canvas), then hand it to the native share sheet — or download as
// fallback on desktop.
import { fmtPoints } from './format';

const W = 1080;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function shareLeaderboardCard({ rows, subtitle, isLive, footer }) {
  const top = rows.slice(0, 10);
  const rowH = 96;
  const headerH = 320;
  const footerH = 130;
  const H = headerH + top.length * rowH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // background: stadium-night gradient + subtle stripes
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#11251a');
  bg.addColorStop(1, '#07100c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  for (let y = 0; y < H; y += 128) ctx.fillRect(0, y, W, 64);

  // header
  ctx.textAlign = 'center';
  ctx.font = '96px system-ui, sans-serif';
  ctx.fillText('🏆', W / 2, 130);
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.fillStyle = '#f4fff8';
  ctx.fillText('Nations League Pool', W / 2, 215);
  ctx.font = '600 36px system-ui, sans-serif';
  ctx.fillStyle = '#ff9a3d';
  ctx.fillText(subtitle + (isLive ? '  ·  🔴 LIVE' : ''), W / 2, 270);

  // rows
  top.forEach((r, i) => {
    const y = headerH + i * rowH;
    const isTop3 = r.rank <= 3;
    ctx.fillStyle = isTop3 ? 'rgba(255,122,0,0.10)' : 'rgba(255,255,255,0.035)';
    roundRect(ctx, 48, y, W - 96, rowH - 14, 20);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = '600 44px system-ui, sans-serif';
    ctx.fillStyle = '#f4fff8';
    const medal = ['🥇', '🥈', '🥉'][r.rank - 1];
    ctx.fillText(medal || `${r.rank}.`, 78, y + 56);
    ctx.font = '48px system-ui, sans-serif';
    ctx.fillText(r.avatar || '⚽', 175, y + 58);
    ctx.font = `${isTop3 ? '800' : '600'} 42px system-ui, sans-serif`;
    let name = r.display_name;
    while (ctx.measureText(name).width > 560 && name.length > 3) name = name.slice(0, -2) + '…';
    ctx.fillText(name, 255, y + 56);

    ctx.textAlign = 'right';
    ctx.font = '900 46px system-ui, sans-serif';
    ctx.fillStyle = isTop3 ? '#ffb267' : '#f4fff8';
    ctx.fillText(fmtPoints(isLive ? r.live_total : r.total_points), W - 90, y + 58);
  });

  // footer
  ctx.textAlign = 'center';
  ctx.font = '600 32px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(244,255,248,0.45)';
  ctx.fillText(footer || '⚽ UEFA Nations League 2026/27', W / 2, H - 60);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = new File([blob], 'nations-league-pool-stand.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Nations League Pool' });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  // fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
