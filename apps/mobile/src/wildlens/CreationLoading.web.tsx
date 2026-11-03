import { useEffect, useState } from 'react';
import { loadingCopy, type CreationLoadingProps } from './creationLoadingCopy';
import { uiFontFamily } from './theme';

// Equal point counts/commands let SVG interpolate one continuous outline, not swap pictures.
function outline(points: [number, number][]) {
  const at = (i: number) => points[(i + points.length) % points.length]!;
  return `M${at(0).join(' ')} ` + points.map((p, i) => {
    const prev = at(i - 1), next = at(i + 1), after = at(i + 2);
    return `C${p[0] + (next[0] - prev[0]) / 6} ${p[1] + (next[1] - prev[1]) / 6} ${next[0] - (after[0] - p[0]) / 6} ${next[1] - (after[1] - p[1]) / 6} ${next.join(' ')}`;
  }).join(' ') + 'Z';
}
const human = outline([[120,35],[144,38],[161,50],[169,71],[167,92],[176,97],[173,111],[165,114],[159,136],[143,151],[120,155],[97,151],[81,136],[75,114],[67,111],[64,97],[73,92],[71,71],[79,50],[96,38]]);
const fox = outline([[120,66],[141,60],[170,32],[170,70],[164,92],[181,102],[173,118],[160,120],[150,142],[134,155],[120,161],[106,155],[90,142],[80,120],[67,118],[59,102],[76,92],[70,70],[70,32],[99,60]]);
const rabbit = outline([[120,69],[132,65],[148,19],[160,20],[158,80],[168,96],[171,114],[163,129],[150,143],[135,152],[120,155],[105,152],[90,143],[77,129],[69,114],[72,96],[82,80],[80,20],[92,19],[108,65]]);
const timing = { dur: '10s', repeatCount: 'indefinite', calcMode: 'spline' as const, keyTimes: '0;.2;.4;.6;.8;1', keySplines: '.4 0 .2 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1' };

export function CreationLoading({ stage, onStop, compact = false }: CreationLoadingProps) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const copy = loadingCopy[stage];
  return <div data-testid="creation-loading" data-reduced-motion={reduced} style={{ fontFamily: uiFontFamily, padding: compact ? '10px 6px' : '10px 12px 16px', textAlign: 'center', color: '#262626', height: '100%', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
    <style>{`
      .wildfie-orbit { animation: wildfie-orbit 10s ease-in-out infinite; transform-origin: 120px 110px; }
      .wildfie-breathe { animation: wildfie-breathe 3s ease-in-out infinite; transform-origin: center; }
      .wildfie-stop { border: 1px solid #dbdbdb; border-radius: 20px; padding: 9px 22px; background: white; color: #555; font: inherit; font-size: 13px; cursor: pointer; }
      .wildfie-stop:hover { background: #fafafa; color: #262626; }
      .wildfie-stop:focus-visible { outline: 3px solid #0095f6; outline-offset: 3px; }
      @keyframes wildfie-orbit { 0%,100% { transform: rotate(-8deg); opacity:.35; } 50% { transform: rotate(12deg); opacity:1; } }
      @keyframes wildfie-breathe { 0%,100% { transform: scale(.97); opacity:.5; } 50% { transform: scale(1.03); opacity:.8; } }
      @media (prefers-reduced-motion: reduce) { .wildfie-orbit,.wildfie-breathe { animation:none; } }
    `}</style>
    <svg viewBox="0 0 240 220" width="240" height="220" aria-hidden="true" focusable="false" style={{ display: 'block', width: compact ? 'min(100%, 130px)' : 'min(100%, 220px)', height: compact ? 110 : 180, flexShrink: 0, margin: '0 auto 4px' }}>
      <defs><radialGradient id="wildfie-loading-glow"><stop stopColor="#fce9ed" /><stop offset="1" stopColor="#fff" /></radialGradient></defs>
      <circle className="wildfie-breathe" cx="120" cy="110" r="97" fill="url(#wildfie-loading-glow)" />
      <g fill="none" stroke="#262626" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M43 203 C48 178 76 181 94 165 L97 150 M143 150 L146 165 C164 181 192 178 197 203" stroke="#999" />
        <path d={reduced ? fox : human}>
          {!reduced ? <animate attributeName="d" values={`${human};${human};${fox};${fox};${rabbit};${human}`} {...timing} /> : null}
        </path>
        <path d="M88 91 Q96 87 104 91 M136 91 Q144 87 152 91" strokeWidth="1.8" />
        <ellipse cx="97" cy="101" rx="3" ry="4">{!reduced ? <animate attributeName="ry" values="4;4;4;.6;4;4" dur="6s" repeatCount="indefinite" begin="2s" /> : null}</ellipse>
        <ellipse cx="143" cy="101" rx="3" ry="4" />
        <path d={reduced ? 'M113 126 Q120 122 127 126 Q124 133 120 134 Q116 133 113 126 Z' : 'M116 105 Q120 101 124 105 Q124 116 120 116 Q116 116 116 105 Z'}>
          {!reduced ? <animate attributeName="d" values="M116 105 Q120 101 124 105 Q124 116 120 116 Q116 116 116 105 Z;M116 105 Q120 101 124 105 Q124 116 120 116 Q116 116 116 105 Z;M113 126 Q120 122 127 126 Q124 133 120 134 Q116 133 113 126 Z;M113 126 Q120 122 127 126 Q124 133 120 134 Q116 133 113 126 Z;M116 121 Q120 118 124 121 Q123 126 120 127 Q117 126 116 121 Z;M116 105 Q120 101 124 105 Q124 116 120 116 Q116 116 116 105 Z" {...timing} /> : null}
        </path>
        <path d="M107 135 Q120 144 133 135" />
        <g opacity={reduced ? 1 : 0} strokeWidth="1.5" stroke="#777">
          <path d="M103 123 L82 119 M102 129 L80 133 M137 123 L158 119 M138 129 L160 133" />
          {!reduced ? <animate attributeName="opacity" values="0;0;1;1;1;0" {...timing} /> : null}
        </g>
        <g stroke="#bc4193" strokeWidth="1.7" className="wildfie-orbit"><path d="M198 71 L198 83 M192 77 L204 77 M39 128 L39 136 M35 132 L43 132" /><circle cx="194" cy="158" r="2" /><circle cx="43" cy="67" r="2" /></g>
      </g>
    </svg>
    {!compact ? <div style={{ color: '#a03d84', fontSize: 10, fontWeight: 600, letterSpacing: '2px', marginBottom: 12 }}>YOU, REIMAGINED</div> : null}
    <div role="status" aria-live="polite" aria-atomic="true">
      <div style={{ fontSize: compact ? 14 : 19, lineHeight: compact ? '19px' : '25px', fontWeight: 600, letterSpacing: '-.4px', marginBottom: compact ? 12 : 8 }}>{copy.title}</div>
      {!compact ? <div style={{ fontSize: 13, lineHeight: '20px', color: '#737373', maxWidth: 300, margin: '0 auto 18px' }}>{copy.detail}</div> : null}
    </div>
    <button type="button" className="wildfie-stop" style={compact ? { padding: '8px 12px', fontSize: 12, flexShrink: 0 } : undefined} onClick={onStop}>Stop creating</button>
  </div>;
}
