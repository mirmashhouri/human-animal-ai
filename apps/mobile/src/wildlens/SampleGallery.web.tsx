import { Asset } from 'expo-asset';
import { sampleComparisons } from './sampleComparisons';
import { webFontFamily } from './theme';

const samples = sampleComparisons.map(sample => ({ ...sample, thumbnailUri: Asset.fromModule(sample.thumbnail).uri }));

export function SampleGallery() {
  return <section data-testid="sample-gallery" aria-labelledby="sample-gallery-title" style={{ fontFamily: webFontFamily, marginTop: 44 }}>
    <style>{`
      .wildfie-sample-heading { margin:0 0 7px; font-size:22px; font-weight:650; letter-spacing:-.6px; color:#262626; }
      .wildfie-sample-hint { margin:0 0 20px; color:#737373; font-size:13px; line-height:20px; }
      .wildfie-sample-grid { columns:2; column-gap:18px; }
      .wildfie-sample-card { display:block; width:100%; padding:0; margin:0 0 18px; break-inside:avoid; border:1px solid #dbdbdb; border-radius:12px; overflow:hidden; background:#fff; }
      .wildfie-sample-card img { display:block; width:100%; height:auto; }
      @media(max-width:640px) { .wildfie-sample-grid { columns:1; } .wildfie-sample-heading { font-size:20px; } }
    `}</style>
    <h2 id="sample-gallery-title" className="wildfie-sample-heading">A little inspiration.</h2>
    <p className="wildfie-sample-hint">One portrait. A whole new wild side.</p>
    <div className="wildfie-sample-grid">{samples.map(sample => <figure key={sample.id} className="wildfie-sample-card">
      <img src={sample.thumbnailUri} width={720} height={Math.round(720 * sample.height / sample.width)} loading="lazy" decoding="async"
        alt={sample.caption + ' — original portrait beside the animal artwork'} />
    </figure>)}</div>
  </section>;
}
