import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CameraCaptureProps } from './cameraTypes';
import { webFontFamily, socialColors as c } from './theme';

function cameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access is blocked. Allow the camera in your browser’s site settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found. Connect a camera or upload a photo instead.';
  if (name === 'NotReadableError') return 'Your camera is busy. Close other camera apps, then try again.';
  return 'The camera could not start. Try again or upload a photo instead.';
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [mirrored, setMirrored] = useState(true);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);

  useEffect(() => {
    let active = true;
    let acquired: MediaStream | null = null;
    const element = video.current;
    setReady(false); setError('');
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? 'This browser does not support live camera capture. Try a recent browser or upload a photo.' : 'Open this page over HTTPS to use the camera on your phone. On this computer, localhost also works.');
        return;
      }
      try {
        acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
          width: { ideal: 1280 }, height: { ideal: 960 },
        } });
        if (!active) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream.current = acquired;
        setMirrored(acquired.getVideoTracks()[0]?.getSettings().facingMode !== 'environment');
        if (element) {
          element.srcObject = acquired;
          await element.play();
          if (active) setReady(true);
        }
        const available = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (active) setDevices(available.filter(device => device.kind === 'videoinput'));
      } catch (reason) {
        acquired?.getTracks().forEach(track => track.stop());
        if (active) setError(cameraError(reason));
      }
    }
    void start();
    return () => {
      active = false;
      acquired?.getTracks().forEach(track => track.stop());
      if (stream.current === acquired) stream.current = null;
      if (element) element.srcObject = null;
    };
  }, [deviceId, attempt]);

  function capture() {
    const element = video.current;
    if (!ready || !element?.videoWidth || !element.videoHeight) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = element.videoWidth; canvas.height = element.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Capture unavailable');
      context.drawImage(element, 0, 0);
      const photo = { uri: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height };
      stream.current?.getTracks().forEach(track => track.stop());
      onCapture(photo);
    } catch { setError('The photo could not be captured. Please try again.'); }
  }
  function switchCamera() {
    const current = stream.current?.getVideoTracks()[0]?.getSettings().deviceId;
    const next = devices[(devices.findIndex(device => device.deviceId === current) + 1) % devices.length];
    if (next) setDeviceId(next.deviceId);
  }

  return <>
    <style>{'#wildfie-camera::backdrop { background: rgba(0,0,0,.65); } #wildfie-camera button:focus-visible { outline: 3px solid #0095f6; outline-offset: 3px; }'}</style>
    <dialog id="wildfie-camera" ref={dialog} aria-labelledby="camera-title" onCancel={event => { event.preventDefault(); onClose(); }} style={styles.dialog}>
      <div style={styles.header}><h2 id="camera-title" style={{ margin: 0, fontSize: 21 }}>Take a selfie</h2><button type="button" aria-label="Close camera" onClick={onClose} style={styles.close}>×</button></div>
      <p style={styles.hint}>Take a photo, then create your animal.</p>
      <video ref={video} autoPlay muted playsInline aria-label="Live camera preview" style={{ ...styles.video, transform: mirrored ? 'scaleX(-1)' : undefined }} />
      {!ready && !error ? <p role="status" style={styles.hint}>Allow camera access in your browser to see the preview.</p> : null}
      {error ? <p role="alert" style={{ ...styles.hint, color: '#a32d22' }}>{error}</p> : null}
      <div style={styles.actions}>
        {error ? <button type="button" onClick={() => setAttempt(value => value + 1)} style={styles.secondary}>Try again</button> : devices.length > 1 ? <button type="button" disabled={!ready} onClick={switchCamera} style={styles.secondary}>Switch camera</button> : null}
        <button type="button" disabled={!ready || Boolean(error)} onClick={capture} style={{ ...styles.primary, opacity: ready && !error ? 1 : 0.45 }}>Take photo</button>
      </div>
      <p style={{ ...styles.hint, marginBottom: 0, fontSize: 12 }}>Your camera photo stays on this device until you choose Create my animal.</p>
    </dialog>
  </>;
}

const button: CSSProperties = { font: 'inherit', fontSize: 14, fontWeight: 600, minHeight: 44, borderRadius: 8, padding: '10px 18px', cursor: 'pointer' };
const styles: Record<string, CSSProperties> = {
  dialog: { boxSizing: 'border-box', width: 'calc(100% - 28px)', maxWidth: 520, maxHeight: 'calc(100dvh - 28px)', overflowY: 'auto', margin: 'auto', border: `1px solid ${c.border}`, borderRadius: 16, padding: 20, fontFamily: webFontFamily, color: c.text, background: c.paper },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  close: { ...button, border: 0, background: 'transparent', fontSize: 28, width: 44, padding: 0, lineHeight: 1 },
  video: { width: '100%', height: 'min(48dvh, 420px)', objectFit: 'contain', display: 'block', borderRadius: 8, background: '#171717' },
  hint: { color: c.muted, fontSize: 14, lineHeight: 1.5, margin: '8px 0 16px' },
  actions: { display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 },
  primary: { ...button, border: 0, background: c.blue, color: '#fff', flex: 1 },
  secondary: { ...button, border: `1px solid ${c.border}`, background: c.paper, color: c.text },
};
