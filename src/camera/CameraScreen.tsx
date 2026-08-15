import { useEffect, useRef, useState } from 'react';
import { appendPage } from '../db/database';
import { processCapturedImage } from '../image/processImage';
import { getStorageHealth, type StorageHealth } from '../storage/storageHealth';
import { captureFrame } from './captureFrame';

interface CameraScreenProps {
  ebookId: string;
  onClose: () => void;
}

type CameraState = 'loading' | 'ready' | 'error';
type StorageState = 'checking' | 'ready' | 'error';

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1440 },
  },
};

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Allow Camera in iPad Settings, then return here and try again.';
  }
  if (typeof error === 'object' && error && 'name' in error && error.name === 'NotAllowedError') {
    return 'Allow Camera in iPad Settings, then return here and try again.';
  }
  return 'The camera could not start. Check that no other app is using it, then try again.';
}

function storageMessage(health: StorageHealth | null) {
  if (health?.level === 'critical') {
    return 'Not enough space to safely save another page. Free up iPad storage, then try again.';
  }
  if (health?.level === 'warning') {
    return 'Storage is running low. You can keep capturing, but free up space soon.';
  }
  return '';
}

export function CameraScreen({ ebookId, onClose }: CameraScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const captureInProgressRef = useRef(false);
  const captureOperationRef = useRef(0);
  const storageOperationRef = useRef(0);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraState, setCameraState] = useState<CameraState>('loading');
  const [cameraError, setCameraError] = useState('');
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [storageState, setStorageState] = useState<StorageState>('checking');
  const [storageError, setStorageError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [capturedCount, setCapturedCount] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    void refreshStorage();
    return () => {
      mountedRef.current = false;
      captureOperationRef.current += 1;
      storageOperationRef.current += 1;
    };
  }, []);

  async function refreshStorage(): Promise<StorageHealth | null> {
    const operation = ++storageOperationRef.current;
    setStorageState('checking');
    setStorageError('');
    try {
      const health = await getStorageHealth();
      if (!mountedRef.current || storageOperationRef.current !== operation) return null;
      setStorageHealth(health);
      setStorageState('ready');
      return health;
    } catch {
      if (!mountedRef.current || storageOperationRef.current !== operation) return null;
      setStorageHealth(null);
      setStorageState('error');
      setStorageError('We could not check available iPad storage. Check device storage, then try again.');
      return null;
    }
  }

  function handleViewfinderMetadata() {
    const video = videoRef.current;
    if (streamRef.current && video && video.videoWidth > 0 && video.videoHeight > 0) {
      setCameraState('ready');
    }
  }

  useEffect(() => {
    let active = true;
    let requestedStream: MediaStream | null = null;

    async function startCamera() {
      setCameraState('loading');
      setCameraError('');
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is unavailable');
        }
        requestedStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (!active) {
          stopTracks(requestedStream);
          return;
        }
        streamRef.current = requestedStream;
        if (videoRef.current) {
          videoRef.current.srcObject = requestedStream;
          handleViewfinderMetadata();
        }
      } catch (error) {
        if (!active) return;
        setCameraState('error');
        setCameraError(cameraErrorMessage(error));
      }
    }

    void startCamera();
    return () => {
      active = false;
      if (streamRef.current === requestedStream) streamRef.current = null;
      stopTracks(requestedStream);
    };
  }, [cameraAttempt]);

  async function handleCapture() {
    if (captureInProgressRef.current || !videoRef.current || cameraState !== 'ready') return;
    const operation = ++captureOperationRef.current;
    captureInProgressRef.current = true;
    setIsSaving(true);
    setSaveError('');
    try {
      const health = await refreshStorage();
      if (!mountedRef.current || captureOperationRef.current !== operation || !health) return;
      if (health.level === 'critical') {
        setSaveError(storageMessage(health));
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      const source = await captureFrame(video);
      const asset = await processCapturedImage(source);
      if (!mountedRef.current || captureOperationRef.current !== operation) return;
      await appendPage(ebookId, asset);
      if (!mountedRef.current || captureOperationRef.current !== operation) return;
      setCapturedCount((count) => count + 1);
    } catch {
      if (mountedRef.current && captureOperationRef.current === operation) {
        setSaveError('This photo could not be processed or saved. Try again; no page was added.');
      }
    } finally {
      captureInProgressRef.current = false;
      if (mountedRef.current && captureOperationRef.current === operation) setIsSaving(false);
    }
  }

  async function handleCheckStorage() {
    setSaveError('');
    await refreshStorage();
  }

  const isCritical = storageState === 'ready' && storageHealth?.level === 'critical';
  const captureDisabled = cameraState !== 'ready' || storageState !== 'ready' || isSaving || isCritical;
  const message = storageError || saveError || storageMessage(storageHealth);

  return (
    <main className="app camera-screen">
      <header className="camera-header">
        <div>
          <h1>Capture pages</h1>
          <p aria-live="polite">{capturedCount} {capturedCount === 1 ? 'page' : 'pages'} captured</p>
        </div>
        <button type="button" onClick={onClose} disabled={isSaving}>Close camera</button>
      </header>

      <video
        ref={videoRef}
        className="camera-viewfinder"
        aria-label="Camera viewfinder"
        autoPlay
        muted
        onLoadedMetadata={handleViewfinderMetadata}
        playsInline
      />

      {cameraState === 'loading' && <p aria-live="polite">Starting camera…</p>}
      {cameraError && <p role="alert">{cameraError}</p>}
      {message && <p role={saveError || storageError || isCritical ? 'alert' : undefined} className="camera-message">{message}</p>}

      {cameraState === 'error' && (
        <button type="button" onClick={() => setCameraAttempt((attempt) => attempt + 1)}>
          Try camera again
        </button>
      )}

      {(isCritical || storageState === 'error') && (
        <button type="button" onClick={() => void handleCheckStorage()} disabled={isSaving}>
          Check storage again
        </button>
      )}

      <button
        type="button"
        className="capture-button"
        onClick={() => void handleCapture()}
        disabled={captureDisabled}
      >
        {isSaving ? 'Saving page…' : 'Capture photo'}
      </button>
    </main>
  );
}
