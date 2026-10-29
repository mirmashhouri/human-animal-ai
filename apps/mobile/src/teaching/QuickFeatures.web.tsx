import type { Example } from './types';

export const quickFeatures: [string, string, string, string][] = [
  ['face_ratio','Face length · کشیدگی صورت','Short / wide','Long / narrow'], ['face_roundness','Face roundness · گردی صورت','Angular','Round'],
  ['forehead_height','Forehead height · ارتفاع پیشانی','Short','Tall'], ['forehead_width','Forehead width · عرض پیشانی','Narrow','Wide'],
  ['cheek_fullness','Cheek fullness · پری گونه','Hollow / flat','Full / rounded'], ['jaw_width','Jaw width · عرض فک','Narrow','Wide'],
  ['chin_pointedness','Chin shape · فرم چانه','Rounded','Pointed'], ['eye_size','Eye size · اندازه چشم','Small','Large'],
  ['eye_spacing','Eye spacing · فاصله چشم','Close','Wide'], ['eye_roundness','Eye shape · فرم چشم','Elongated','Round'],
  ['eye_projection','Eye prominence · برجستگی چشم','Deep-set','Prominent'], ['brow_thickness','Eyebrows · ضخامت ابرو','Thin','Thick'],
  ['nose_length','Nose length · طول بینی','Short','Long'], ['nose_width','Nose width · عرض بینی','Narrow','Wide'],
  ['nose_projection','Nose prominence · برجستگی بینی','Low','High'], ['mouth_width','Mouth width · عرض دهان','Narrow','Wide'],
  ['lip_fullness','Lip fullness · حجم لب','Thin','Full'], ['smile_curve','Smile curve · انحنای لبخند','Downturned','Upturned'],
  ['tooth_display','Visible teeth · نمایانی دندان','Little / none','Much'], ['ear_prominence','Ear prominence · برجستگی گوش','Close / small','Prominent'],
];
const appearanceOptions: [string, string, string[]][] = [
  ['eye_color','Eye color · رنگ چشم',['Brown','Dark brown','Hazel','Green','Blue','Gray','Not clear']],
  ['hair_shape','Hair · فرم مو',['Straight','Wavy','Curly','Coiled','Braided','Short','Bald / shaved','Covered','Not clear']],
  ['glasses','Glasses · عینک',['None','Round','Angular','Sunglasses','On head','Not clear']],
  ['facial_hair','Facial hair · ریش',['None','Stubble','Beard','Moustache','Goatee','Not clear']],
];
export default function QuickFeatures({ item, change }: { item: Example; change: (patch: Partial<Example>) => void }) {
  const scale = item.traitScale ?? 100;
  function rate(key: string, value: number | null) {
    const previous = item.traits.find(t => t.key === key);
    change({ traits: [...item.traits.filter(t => t.key !== key), { key, value: value === null ? null : value * scale / 5,
      visibility: value === null ? 'uncertain' : 'clear', importance: previous?.importance ?? null, renderInstruction: previous?.renderInstruction ?? '' }] });
  }
  return <section className="teach-quick-features"><div className="teach-section-heading"><h3>What stands out? · کدام ویژگی برجسته است؟</h3><span className="teach-badge">{item.salientFeatures?.length ?? 0} standout</span></div>
    <p className="teach-help">Tick only the features that matter to your caricaturist’s eye. Rate any you want. Blank ≠ 0; zero is your visual midpoint, not a measured population norm. Hidden or uncertain? Leave it blank.</p>
    <div className="teach-feature-grid">{quickFeatures.map(([key,label,low,high]) => {
      const trait = item.traits.find(t => t.key === key); const value = trait?.visibility === 'clear' && trait.value !== null && trait.value !== undefined ? trait.value / scale * 5 : null;
      const salient = item.salientFeatures?.includes(key) ?? false;
      return <div className={`teach-feature ${salient ? 'is-salient' : ''} ${value === null ? 'is-unrated' : ''}`} key={key}>
        <div className="teach-feature-top"><label className="teach-feature-check"><input type="checkbox" aria-label={`Standout ${key}`} checked={salient} onChange={event => change({ salientFeatures: event.target.checked ? [...(item.salientFeatures ?? []),key] : (item.salientFeatures ?? []).filter(k => k !== key) })} /><span>{label}</span></label><output>{value === null ? '—' : `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10}`}</output></div>
        <input type="range" aria-label={`Rate ${key}`} min={-5} max={5} step={1} value={value ?? 0} onChange={event => rate(key, Number(event.target.value))} />
        <div className="teach-feature-anchors"><span>−5 · {low}</span><button type="button" aria-label={`Set midpoint ${key}`} onClick={() => rate(key,0)}>0</button><span>{high} · +5</span></div>
        {value !== null && <button type="button" className="teach-feature-clear" aria-label={`Clear rating ${key}`} onClick={() => rate(key,null)}>Clear rating</button>}
      </div>;
    })}</div>
    <details className="teach-details"><summary>Colors & details to preserve · رنگ و جزئیات</summary><p className="teach-help">Appearance details support rendering after choosing an animal; they are not numeric face-geometry ratings.</p><div className="teach-two-columns">{appearanceOptions.map(([key,label,options]) => <label key={key}>{label}<select aria-label={label} value={item.appearance?.[key] ?? ''} onChange={event => change({ appearance: { ...item.appearance, [key]: event.target.value } })}><option value="">Not rated</option>{options.map(value => <option key={value}>{value}</option>)}</select></label>)}</div></details>
  </section>;
}
