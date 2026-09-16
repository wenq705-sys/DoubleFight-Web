export type UiRect = { x: number; y: number; width: number; height: number };
export type UiIcon =
  | 'coin' | 'world' | 'collection' | 'rank' | 'gift' | 'solo' | 'pvp'
  | 'settings' | 'video' | 'sync' | 'share' | 'room' | 'back' | 'close' | 'check' | 'energy';

export type UiMetrics = {
  scale: number;
  compact: boolean;
  tall: boolean;
  edge: number;
  minTouch: number;
  top: number;
  bottom: number;
  contentWidth: number;
};

export const UI_COLORS = {
  ink: '#071820',
  surface: 'rgba(10,34,42,.96)',
  line: 'rgba(255,232,166,.28)',
  lineStrong: 'rgba(244,207,106,.62)',
  gold: '#f3cf70',
  goldLight: '#ffe9a8',
  mint: '#68d8cc',
  text: '#f4f4ea',
  textMuted: '#a7bec0',
  textFaint: '#738a8d',
  danger: '#ff9f93',
  success: '#7fe0af',
} as const;

export function clampUi(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function uiMetrics(
  width: number,
  height: number,
  safeArea: { top?: number; right?: number; bottom?: number; left?: number } = {},
  menuButtonBottom = 0,
): UiMetrics {
  const safeTop = Math.max(0, safeArea.top ?? 0);
  const safeRight = Math.max(0, safeArea.right ?? 0);
  const safeBottom = Math.max(0, safeArea.bottom ?? 0);
  const safeLeft = Math.max(0, safeArea.left ?? 0);
  const scale = clampUi(width / 390, 0.88, 1.12);
  const compact = width < 350 || height < 720 || height / Math.max(1, width) < 1.72;
  const tall = height / Math.max(1, width) > 2.08;
  const edge = Math.round(clampUi(16 * scale, 12, 20));
  const minTouch = Math.round(clampUi(48 * scale, 44, 54));
  const top = Math.round(Math.max(12, safeTop + 8, menuButtonBottom + 8));
  const bottom = Math.round(Math.max(16, safeBottom + 12));
  return {
    scale,
    compact,
    tall,
    edge,
    minTouch,
    top,
    bottom,
    contentWidth: Math.max(1, width - safeLeft - safeRight - edge * 2),
  };
}

export function ensureTouchRect(rect: UiRect, minTouch = 44): UiRect {
  const width = Math.max(rect.width, minTouch);
  const height = Math.max(rect.height, minTouch);
  return {
    x: rect.x - (width - rect.width) / 2,
    y: rect.y - (height - rect.height) / 2,
    width,
    height,
  };
}

export function hitTarget(x: number, y: number, rect: UiRect, minTouch = 44): boolean {
  const target = ensureTouchRect(rect, minTouch);
  return x >= target.x && x <= target.x + target.width
    && y >= target.y && y <= target.y + target.height;
}

export function roundPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawPremiumPanel(
  ctx: CanvasRenderingContext2D,
  rect: UiRect,
  accent = false,
): void {
  ctx.save();
  roundPath(ctx, rect.x, rect.y, rect.width, rect.height, 24);
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  gradient.addColorStop(0, 'rgba(15,45,54,.985)');
  gradient.addColorStop(.55, 'rgba(9,31,40,.985)');
  gradient.addColorStop(1, 'rgba(6,23,31,.99)');
  ctx.shadowColor = 'rgba(0,0,0,.34)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = accent ? UI_COLORS.lineStrong : UI_COLORS.line;
  ctx.lineWidth = accent ? 1.35 : 1;
  ctx.stroke();

  roundPath(ctx, rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2, 23);
  const topGlow = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y);
  topGlow.addColorStop(0, 'rgba(255,255,255,.02)');
  topGlow.addColorStop(.5, 'rgba(255,238,184,.18)');
  topGlow.addColorStop(1, 'rgba(255,255,255,.02)');
  ctx.strokeStyle = topGlow;
  ctx.lineWidth = .8;
  ctx.stroke();
  ctx.restore();
}

export function drawPremiumButton(
  ctx: CanvasRenderingContext2D,
  rect: UiRect,
  label: string,
  options: {
    kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
    icon?: UiIcon;
    disabled?: boolean;
    loading?: boolean;
    compact?: boolean;
  } = {},
): void {
  const kind = options.kind ?? 'secondary';
  const disabled = Boolean(options.disabled);
  ctx.save();
  roundPath(ctx, rect.x, rect.y, rect.width, rect.height, Math.min(20, rect.height / 2));
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  if (disabled) {
    gradient.addColorStop(0, 'rgba(47,59,63,.76)');
    gradient.addColorStop(1, 'rgba(34,45,50,.76)');
  } else if (kind === 'primary') {
    gradient.addColorStop(0, '#ffe08a');
    gradient.addColorStop(.55, '#f0c35e');
    gradient.addColorStop(1, '#d98d45');
  } else if (kind === 'danger') {
    gradient.addColorStop(0, '#9f4944');
    gradient.addColorStop(1, '#713530');
  } else if (kind === 'ghost') {
    gradient.addColorStop(0, 'rgba(18,47,56,.58)');
    gradient.addColorStop(1, 'rgba(10,30,39,.58)');
  } else {
    gradient.addColorStop(0, 'rgba(27,73,82,.98)');
    gradient.addColorStop(1, 'rgba(14,48,61,.98)');
  }
  ctx.shadowColor = !disabled && kind === 'primary' ? 'rgba(239,183,82,.34)' : 'rgba(0,0,0,.20)';
  ctx.shadowBlur = !disabled && kind === 'primary' ? 15 : 8;
  ctx.shadowOffsetY = kind === 'primary' ? 4 : 3;
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = disabled
    ? 'rgba(151,165,166,.20)'
    : kind === 'primary'
      ? 'rgba(255,239,184,.86)'
      : kind === 'danger'
        ? 'rgba(255,188,174,.54)'
        : 'rgba(255,231,166,.38)';
  ctx.lineWidth = 1.15;
  ctx.stroke();

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const fontSize = options.compact ? 12 : kind === 'primary' ? 15 : 12.5;
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${fontSize}px sans-serif`;
  const text = options.loading ? '处理中…' : label;
  const iconGap = options.icon ? 27 : 0;
  const maxTextWidth = Math.max(20, rect.width - 24 - iconGap);
  const size = fitText(ctx, text, maxTextWidth, fontSize, 900, 9);
  ctx.font = `900 ${size}px sans-serif`;
  const textWidth = Math.min(ctx.measureText(text).width, maxTextWidth);
  const groupWidth = textWidth + iconGap;
  const startX = centerX - groupWidth / 2;
  if (options.icon) {
    drawUiIcon(
      ctx,
      options.icon,
      startX + 9,
      centerY,
      options.compact ? 15 : 18,
      disabled ? UI_COLORS.textFaint : kind === 'primary' ? '#57371d' : UI_COLORS.goldLight,
    );
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = disabled
    ? UI_COLORS.textFaint
    : kind === 'primary'
      ? '#4b311d'
      : kind === 'danger'
        ? '#ffe6dd'
        : '#fff1c7';
  ctx.fillText(text, startX + iconGap, centerY + .5);
  ctx.restore();
}

export function drawSCoinIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  glow = false,
): void {
  const r = size / 2;
  ctx.save();
  if (glow) {
    ctx.shadowColor = 'rgba(244,203,91,.55)';
    ctx.shadowBlur = Math.max(8, size * .45);
  }
  const outer = ctx.createRadialGradient(cx - r * .3, cy - r * .38, r * .1, cx, cy, r);
  outer.addColorStop(0, '#fff1a7');
  outer.addColorStop(.48, '#f1c352');
  outer.addColorStop(1, '#a86529');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = outer;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffe69a';
  ctx.lineWidth = Math.max(1, size * .055);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * .72, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(115,68,27,.50)';
  ctx.lineWidth = Math.max(1, size * .045);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5a371d';
  ctx.font = `950 ${Math.max(9, Math.round(size * .52))}px sans-serif`;
  ctx.fillText('S', cx, cy + size * .025);
  ctx.restore();
}

export function drawUiIcon(
  ctx: CanvasRenderingContext2D,
  icon: UiIcon,
  cx: number,
  cy: number,
  size: number,
  color = UI_COLORS.goldLight,
): void {
  if (icon === 'coin') { drawSCoinIcon(ctx, cx, cy, size); return; }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, size * .09);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = size / 2;
  switch (icon) {
    case 'world':
      ctx.beginPath(); ctx.arc(0, 0, s * .82, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, s * .38, s * .82, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * .72, 0); ctx.lineTo(s * .72, 0); ctx.stroke();
      break;
    case 'collection':
      ctx.beginPath(); ctx.moveTo(-s * .82, -s * .65); ctx.lineTo(-s * .08, -s * .46); ctx.lineTo(-s * .08, s * .72); ctx.lineTo(-s * .82, s * .50); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * .82, -s * .65); ctx.lineTo(s * .08, -s * .46); ctx.lineTo(s * .08, s * .72); ctx.lineTo(s * .82, s * .50); ctx.closePath(); ctx.stroke();
      break;
    case 'rank':
      ctx.beginPath(); ctx.moveTo(-s * .54, -s * .62); ctx.lineTo(s * .54, -s * .62); ctx.lineTo(s * .38, s * .08); ctx.quadraticCurveTo(0, s * .44, -s * .38, s * .08); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, s * .30); ctx.lineTo(0, s * .62); ctx.moveTo(-s * .36, s * .70); ctx.lineTo(s * .36, s * .70); ctx.stroke();
      break;
    case 'gift':
      ctx.strokeRect(-s * .72, -s * .16, s * 1.44, s * .86);
      ctx.beginPath(); ctx.moveTo(-s * .82, -s * .18); ctx.lineTo(s * .82, -s * .18); ctx.moveTo(0, -s * .18); ctx.lineTo(0, s * .70); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * .22); ctx.quadraticCurveTo(-s * .18, -s * .86, -s * .55, -s * .55); ctx.quadraticCurveTo(-s * .55, -s * .22, 0, -s * .22); ctx.quadraticCurveTo(s * .18, -s * .86, s * .55, -s * .55); ctx.quadraticCurveTo(s * .55, -s * .22, 0, -s * .22); ctx.stroke();
      break;
    case 'solo':
      ctx.beginPath(); ctx.moveTo(0, -s * .85); ctx.lineTo(s * .70, 0); ctx.lineTo(0, s * .85); ctx.lineTo(-s * .70, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * .30, 0); ctx.lineTo(s * .30, 0); ctx.moveTo(0, -s * .30); ctx.lineTo(0, s * .30); ctx.stroke();
      break;
    case 'pvp':
      ctx.beginPath(); ctx.moveTo(-s * .70, -s * .72); ctx.lineTo(s * .52, s * .50); ctx.moveTo(s * .70, -s * .72); ctx.lineTo(-s * .52, s * .50); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * .35, s * .34); ctx.lineTo(s * .68, s * .68); ctx.moveTo(-s * .35, s * .34); ctx.lineTo(-s * .68, s * .68); ctx.stroke();
      break;
    case 'settings':
      ctx.beginPath(); ctx.arc(0, 0, s * .34, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i += 1) {
        const a = i * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * .58, Math.sin(a) * s * .58); ctx.lineTo(Math.cos(a) * s * .84, Math.sin(a) * s * .84); ctx.stroke();
      }
      break;
    case 'video':
      ctx.beginPath(); ctx.arc(0, 0, s * .82, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * .18, -s * .34); ctx.lineTo(s * .42, 0); ctx.lineTo(-s * .18, s * .34); ctx.closePath(); ctx.fill();
      break;
    case 'sync':
      ctx.beginPath(); ctx.arc(0, 0, s * .68, -.35, Math.PI * 1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * .55, s * .52); ctx.lineTo(-s * .78, s * .28); ctx.lineTo(-s * .46, s * .20); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * .68, Math.PI - .35, Math.PI * 2.1); ctx.stroke();
      break;
    case 'share':
      ctx.beginPath(); ctx.moveTo(-s * .65, s * .45); ctx.lineTo(s * .40, -s * .55); ctx.moveTo(s * .40, -s * .55); ctx.lineTo(s * .40, -s * .12); ctx.moveTo(s * .40, -s * .55); ctx.lineTo(-s * .05, -s * .55); ctx.stroke();
      break;
    case 'room':
      ctx.beginPath(); ctx.arc(-s * .30, -s * .24, s * .28, 0, Math.PI * 2); ctx.arc(s * .32, -s * .18, s * .23, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * .30, s * .52, s * .55, Math.PI, Math.PI * 2); ctx.arc(s * .32, s * .48, s * .45, Math.PI, Math.PI * 2); ctx.stroke();
      break;
    case 'back':
      ctx.beginPath(); ctx.moveTo(s * .34, -s * .70); ctx.lineTo(-s * .38, 0); ctx.lineTo(s * .34, s * .70); ctx.stroke();
      break;
    case 'close':
      ctx.beginPath(); ctx.moveTo(-s * .55, -s * .55); ctx.lineTo(s * .55, s * .55); ctx.moveTo(s * .55, -s * .55); ctx.lineTo(-s * .55, s * .55); ctx.stroke();
      break;
    case 'check':
      ctx.beginPath(); ctx.moveTo(-s * .62, 0); ctx.lineTo(-s * .16, s * .45); ctx.lineTo(s * .68, -s * .52); ctx.stroke();
      break;
    case 'energy':
      ctx.beginPath(); ctx.moveTo(s * .08, -s * .86); ctx.lineTo(-s * .46, s * .08); ctx.lineTo(-s * .02, s * .08); ctx.lineTo(-s * .16, s * .86); ctx.lineTo(s * .52, -s * .16); ctx.lineTo(s * .08, -s * .16); ctx.closePath(); ctx.fill();
      break;
  }
  ctx.restore();
}

export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  baseSize: number,
  weight = 800,
  minSize = 9,
): number {
  let size = baseSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= .5;
  }
  ctx.font = `${weight} ${minSize}px sans-serif`;
  return minSize;
}
