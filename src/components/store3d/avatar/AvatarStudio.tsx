import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, Upload, ShieldCheck, X, ArrowRight, RotateCcw, Trash2, Sparkles, Check, User, Shirt, Glasses, Info, Loader2, ChevronLeft, Sun, Image as ImageIcon,
} from 'lucide-react';
import { AvatarConfig, HairStyle } from '../../../types';
import { AvatarPreview, AvatarPreviewHandle, PreviewAngle } from './AvatarPreview';
import { READY_MADE_AVATARS, normaliseAvatarConfig } from './AvatarModel';
import { estimateAppearance, FaceOval, requestProviderAvatar, saveAvatar } from './avatarService';
import { buildPhotoFace, preloadPhotoFace } from './photoFace';

type Step = 'start' | 'photo' | 'presets' | 'generating' | 'preview' | 'customize';

interface Props {
  open: boolean;
  initialConfig: AvatarConfig;
  initialStep?: Step;
  signedIn: boolean;
  providerAvailable: boolean;
  onClose: () => void;
  /** confirmed avatar; `enter` = customer pressed ENTER STORE */
  onConfirm: (cfg: AvatarConfig, enter: boolean) => void;
}

const SKIN = ['#f6d7c0', '#eec4a3', '#e2b896', '#d3a07c', '#c99a74', '#b98a64', '#a87c5a', '#8d6446', '#7a5236', '#6b4630', '#55361f', '#3e2718'];
const HAIR = ['#120f0d', '#1d1714', '#3a2416', '#5a3a22', '#8a5a33', '#b48a5a', '#d6b98a', '#6e6a66', '#b9b5ae'];
const SCARF = ['#1f2a44', '#4b5a6a', '#e8dccb', '#8e1b2b', '#3f5a45', '#c99b86', '#141414', '#f4f4f1'];
const EYES = ['#2b1d14', '#3b2a1e', '#5a4632', '#4a6a3a', '#3e6aa8', '#6e7a86'];
const CLOTH = ['#f4f4f1', '#dfe7ef', '#e8dccb', '#b9a27a', '#9cc3e6', '#3e6aa8', '#1f2a44', '#2f3640', '#141414', '#4d5a3a', '#3f5a45', '#9f1239', '#8e1b2b', '#c2410c', '#c8a96a', '#7a4a2a'];
const HAIRSTYLES: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'Short' }, { id: 'parted', label: 'Side part' }, { id: 'buzz', label: 'Buzz' }, { id: 'curly', label: 'Curly' }, { id: 'waves', label: 'Waves' },
  { id: 'bob', label: 'Bob' }, { id: 'long', label: 'Long' }, { id: 'ponytail', label: 'Ponytail' }, { id: 'bun', label: 'Bun' }, { id: 'headscarf', label: 'Headscarf' },
];

function Swatches({ colors, value, onChange, label }: { colors: string[]; value?: string; onChange: (c: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      {colors.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value?.toLowerCase() === c.toLowerCase()}
          aria-label={`${label} ${c}`}
          onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-full border transition ${value?.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-[#c8a96a] ring-offset-2 ring-offset-[#1b1916] border-white/60' : 'border-white/15 hover:scale-110'}`}
          style={{ backgroundColor: c }}
        />
      ))}
      <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-dashed border-white/30" title="Custom colour">
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/70">+</span>
        <input type="color" aria-label={`Custom ${label}`} value={value || '#888888'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0" />
      </label>
    </div>
  );
}

function Chips<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value?: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${value === o.id ? 'bg-[#c8a96a] text-[#1a1712]' : 'bg-white/[0.06] text-white/80 hover:bg-white/[0.12]'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">{title}</div>
      {children}
    </div>
  );
}

export const AvatarStudio: React.FC<Props> = ({ open, initialConfig, initialStep = 'start', signedIn, providerAvailable, onClose, onConfirm }) => {
  const [step, setStep] = useState<Step>(initialStep);
  const [cfg, setCfg] = useState<AvatarConfig>(initialConfig);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [consentPhoto, setConsentPhoto] = useState(false);
  const [consentProvider, setConsentProvider] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [oval, setOval] = useState<FaceOval>({ cx: 0.5, cy: 0.42, rx: 0.2, ry: 0.27 });
  const [genStatus, setGenStatus] = useState<string[]>([]);
  const [tab, setTab] = useState<'body' | 'face' | 'clothing' | 'accessories'>('body');
  const [saveAccount, setSaveAccount] = useState(false);
  const [saveDevice, setSaveDevice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<AvatarPreviewHandle>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const photoBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setStep(initialStep);
      setCfg(initialConfig);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && (step === 'photo' || step === 'start')) preloadPhotoFace();
  }, [open, step]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  const clearPhoto = useCallback(() => {
    if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setEstimateNote(null);
  }, [photoUrl]);

  // release photo + camera whenever the studio closes or unmounts
  useEffect(() => {
    if (!open) {
      stopCamera();
      clearPhoto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const update = (patch: Partial<AvatarConfig>) => setCfg((c) => ({ ...c, ...patch, source: c.source === 'preset' ? 'custom' : c.source }));
  const updateAcc = (patch: Partial<AvatarConfig['accessories']>) => setCfg((c) => ({ ...c, accessories: { ...c.accessories, ...patch } }));

  const startCamera = async () => {
    setCamError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('This browser does not support camera capture. Please upload a photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCamError('Camera permission was not granted. You can upload a photo or choose a ready-made avatar instead.');
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d')!;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1); // keep the selfie mirrored like the live preview
    ctx.drawImage(v, 0, 0);
    stopCamera();
    c.toBlob((b) => {
      if (b) setPhotoUrl(URL.createObjectURL(b));
    }, 'image/jpeg', 0.9);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      setCamError('Please choose a JPEG, PNG or WebP image.');
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setCamError('That image is larger than 15 MB. Please choose a smaller photo.');
      return;
    }
    clearPhoto();
    setPhotoUrl(URL.createObjectURL(f));
  };

  const createFromPhoto = async () => {
    if (!photoUrl) return;
    setStep('generating');
    const log: string[] = [];
    const push = (s: string) => {
      log.push(s);
      setGenStatus([...log]);
    };
    try {
      push('Fitting a 3D head to the face in your photo…');
      const est = await estimateAppearance(photoUrl, oval);
      const face = await buildPhotoFace(photoUrl);
      if (!face) {
        push('No face was found. Use a clear, front-facing photo and try again.');
        setStep('photo');
        return;
      }
      let next: AvatarConfig = {
        ...cfg,
        skinTone: est.skinTone,
        hairColor: cfg.hairStyle === 'headscarf' ? cfg.hairColor : est.hairColor,
        outfitColor: est.topColor || cfg.outfitColor,
        portrait: face.portrait,
        faceShape: face.faceShape,
        source: 'photo-estimate',
        glbUrl: undefined,
      };
      if (providerAvailable && consentProvider) {
        push('Sending your photo to the store’s 3D avatar service…');
        try {
          const res = await requestProviderAvatar(photoUrl);
          if (res?.glbUrl) {
            next = { ...next, ...(res.appearance || {}), glbUrl: res.glbUrl, source: 'provider' };
            push('3D model received.');
          } else push('The 3D avatar service is not available — using the customisable avatar.');
        } catch (e: any) {
          push(`3D avatar service error: ${e.message}. Using the customisable avatar instead.`);
        }
      }
      push('Building your head…');
      setCfg(next);
      setEstimateNote(
        est.confidence === 'good'
          ? 'This head is shaped from your photo. The body stays the fitting model so clothes can be tried on.'
          : 'This head is shaped from your photo. Check skin and clothing colours, then adjust anything you like.',
      );
      clearPhoto();
      push('The original photo was removed. The 3D head stays on your avatar.');
      await new Promise((r) => setTimeout(r, 450));
      setStep('preview');
    } catch (e: any) {
      push(e?.message || 'We could not read that photo. Please try another one.');
      setStep('photo');
    }
  };

  const confirm = async (enter: boolean) => {
    setSaveError(null);
    const final = normaliseAvatarConfig({ ...cfg, version: 2 });
    if (saveAccount || saveDevice) {
      try {
        await saveAvatar(final, { account: saveAccount && signedIn, device: saveDevice });
      } catch (e: any) {
        setSaveError(e.message);
        return;
      }
    }
    onConfirm(final, enter);
  };

  // face-oval dragging
  const onOvalDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: oval.cx, oy: oval.cy };
  };
  const onOvalMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !photoBoxRef.current) return;
    const r = photoBoxRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.x) / r.width;
    const dy = (e.clientY - dragRef.current.y) / r.height;
    setOval((o) => ({ ...o, cx: Math.min(0.9, Math.max(0.1, dragRef.current!.ox + dx)), cy: Math.min(0.9, Math.max(0.1, dragRef.current!.oy + dy)) }));
  };

  if (!open) return null;

  const angleBtn = (a: PreviewAngle, label: string) => (
    <button onClick={() => previewRef.current?.setAngle(a)} className="rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur hover:bg-black/70">
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Create my virtual self">
      <div className="relative flex h-full w-full max-w-6xl flex-col overflow-hidden bg-[#1b1916] text-white shadow-2xl sm:h-[min(860px,94vh)] sm:rounded-[28px] sm:border sm:border-white/10 lg:flex-row">
        <button onClick={onClose} aria-label="Close avatar studio" className="absolute right-3 top-3 z-20 rounded-full bg-black/40 p-2 text-white/80 hover:bg-black/70 hover:text-white">
          <X className="h-5 w-5" />
        </button>

        {/* Preview room */}
        <div className="relative h-[38vh] shrink-0 bg-[#171512] lg:h-auto lg:w-[46%]">
          <AvatarPreview ref={previewRef} config={cfg} className="h-full w-full" label="Preview room · drag to rotate" />
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
            {angleBtn('front', 'Front')}
            {angleBtn('side', 'Side')}
            {angleBtn('back', 'Back')}
          </div>
          {(cfg.portrait || cfg.source === 'provider') && (
            <div className="absolute left-3 top-12 flex items-center gap-2 rounded-full border border-[#c8a96a]/40 bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-[#ead6ab] backdrop-blur">
              {cfg.portrait && <img src={cfg.portrait} alt="" className="h-5 w-5 rounded-full object-cover" />}
              Your photo
            </div>
          )}
        </div>

        {/* Panel */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-6 sm:px-8">
            {step === 'start' && (
              <div className="space-y-6">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8a96a]">ShopWalk 360 · Avatar Studio</div>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Create my virtual self</h2>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">Your avatar walks through the store for you and can try on clothing and accessories. Choose how you’d like to start.</p>
                </div>
                <button onClick={() => setStep('photo')} className="group flex w-full items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-[#c8a96a]/60 hover:bg-white/[0.07]">
                  <div className="rounded-xl bg-[#c8a96a]/15 p-3 text-[#c8a96a]"><Camera className="h-6 w-6" /></div>
                  <div className="flex-1">
                    <div className="font-semibold">Start from my photo</div>
                    <div className="mt-1 text-xs leading-relaxed text-white/60">Upload a clear, front-facing photo. A 3D head is fitted to that face on this device. The body stays a fitting model so clothes can be tried on.</div>
                  </div>
                  <ArrowRight className="mt-1 h-5 w-5 text-white/40 transition group-hover:translate-x-1 group-hover:text-[#c8a96a]" />
                </button>
                <button onClick={() => setStep('presets')} className="group flex w-full items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-[#c8a96a]/60 hover:bg-white/[0.07]">
                  <div className="rounded-xl bg-white/10 p-3 text-white/80"><User className="h-6 w-6" /></div>
                  <div className="flex-1">
                    <div className="font-semibold">Guest mode — choose a ready-made avatar</div>
                    <div className="mt-1 text-xs leading-relaxed text-white/60">No photo needed. Pick a look and customise it if you like.</div>
                  </div>
                  <ArrowRight className="mt-1 h-5 w-5 text-white/40 transition group-hover:translate-x-1 group-hover:text-[#c8a96a]" />
                </button>
                <div className="flex gap-3 rounded-2xl bg-white/[0.03] p-4 text-xs leading-relaxed text-white/60">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
                  <div>
                    <span className="font-semibold text-white/80">How your photo is handled.</span> The original stays in this browser while you are in the studio, then it is removed. A 3D head from that face can be remembered on this device. We do not identify you. Your account saves colours and clothing only.
                  </div>
                </div>
              </div>
            )}

            {step === 'photo' && (
              <div className="space-y-5">
                <button onClick={() => { stopCamera(); setStep('start'); }} className="flex items-center gap-1 text-xs font-semibold text-white/60 hover:text-white"><ChevronLeft className="h-4 w-4" /> Back</button>
                <h2 className="text-2xl font-bold tracking-tight">Your photo</h2>
                <ul className="grid grid-cols-1 gap-2 text-xs text-white/70 sm:grid-cols-2">
                  {['Face clearly visible', 'Good, even lighting', 'Front-facing', 'No sunglasses or face covering', 'Head and shoulders in frame'].map((t) => (
                    <li key={t} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#c8a96a]" /> {t}</li>
                  ))}
                </ul>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-white/75">
                  <input type="checkbox" checked={consentPhoto} onChange={(e) => setConsentPhoto(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#c8a96a]" />
                  <span>I agree that my photo is processed <b>on this device</b> to build a 3D head and match skin, hair and clothing colours. The original photo is removed when I finish. The 3D head can be remembered on this device if I choose to save it.</span>
                </label>

                {providerAvailable && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-white/75">
                    <input type="checkbox" checked={consentProvider} onChange={(e) => setConsentProvider(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#c8a96a]" disabled={!consentPhoto} />
                    <span><b>Optional:</b> also send my photo once to the store’s 3D avatar service to generate a 3D model. It is used only for this purpose and is not used for training. (Separate consent.)</span>
                  </label>
                )}

                {!photoUrl && !camOn && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center text-sm transition ${consentPhoto ? 'cursor-pointer border-white/25 hover:border-[#c8a96a] hover:bg-white/[0.04]' : 'cursor-not-allowed border-white/10 opacity-40'}`}>
                      <Upload className="h-6 w-6 text-[#c8a96a]" />
                      <span className="font-semibold">Upload a photo</span>
                      <span className="text-[11px] text-white/50">JPEG, PNG or WebP · up to 15 MB</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!consentPhoto} onChange={onFile} className="hidden" />
                    </label>
                    <button disabled={!consentPhoto} onClick={startCamera} className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/15 p-6 text-sm transition enabled:hover:border-[#c8a96a] enabled:hover:bg-white/[0.04] disabled:opacity-40">
                      <Camera className="h-6 w-6 text-[#c8a96a]" />
                      <span className="font-semibold">Take a photo</span>
                      <span className="text-[11px] text-white/50">Your browser will ask for camera permission</span>
                    </button>
                  </div>
                )}
                {camError && <div className="rounded-xl bg-rose-500/15 p-3 text-xs text-rose-200">{camError}</div>}

                {camOn && (
                  <div className="space-y-3">
                    <div className="relative overflow-hidden rounded-2xl bg-black">
                      <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full -scale-x-100 object-cover sm:aspect-[4/3]" />
                      <div className="pointer-events-none absolute left-1/2 top-[42%] h-[52%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/70" />
                      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"><span className="h-1.5 w-1.5 rounded-full bg-white" /> Camera on</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={capture} className="flex-1 rounded-xl bg-[#c8a96a] py-3 text-sm font-bold text-[#1a1712] hover:bg-[#d6b97c]">Capture photo</button>
                      <button onClick={stopCamera} className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/15">Cancel</button>
                    </div>
                  </div>
                )}

                {photoUrl && (
                  <div className="space-y-3">
                    <div className="text-xs text-white/65">Drag the oval so it sits over your face, and resize it with the slider.</div>
                    <div ref={photoBoxRef} className="relative mx-auto max-w-sm touch-none select-none overflow-hidden rounded-2xl bg-black">
                      <img src={photoUrl} alt="Your photo (kept on this device only)" className="block w-full" draggable={false} />
                      <div
                        onPointerDown={onOvalDown}
                        onPointerMove={onOvalMove}
                        onPointerUp={() => (dragRef.current = null)}
                        className="absolute cursor-move rounded-[50%] border-2 border-[#c8a96a] shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                        style={{ left: `${(oval.cx - oval.rx) * 100}%`, top: `${(oval.cy - oval.ry) * 100}%`, width: `${oval.rx * 200}%`, height: `${oval.ry * 200}%` }}
                        aria-label="Face position marker"
                      />
                    </div>
                    <input type="range" min={0.1} max={0.4} step={0.01} value={oval.rx} aria-label="Face oval size" onChange={(e) => setOval((o) => ({ ...o, rx: +e.target.value, ry: +e.target.value * 1.35 }))} className="w-full accent-[#c8a96a]" />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={createFromPhoto} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#c8a96a] py-3 text-sm font-bold text-[#1a1712] hover:bg-[#d6b97c]"><Sparkles className="h-4 w-4" /> Create my avatar</button>
                      <label className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-white/10 px-4 py-3 text-xs font-semibold hover:bg-white/15">
                        <RotateCcw className="h-4 w-4" /> Replace
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
                      </label>
                      <button onClick={clearPhoto} className="flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-3 text-xs font-semibold text-rose-200 hover:bg-white/15"><Trash2 className="h-4 w-4" /> Remove photo</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'generating' && (
              <div className="flex h-full flex-col justify-center space-y-4 py-10">
                <Loader2 className="h-8 w-8 animate-spin text-[#c8a96a]" />
                <h2 className="text-2xl font-bold">Creating your avatar</h2>
                <ul className="space-y-2 text-sm text-white/70" aria-live="polite">
                  {genStatus.map((s, i) => (
                    <li key={i} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {step === 'presets' && (
              <div className="space-y-5">
                <button onClick={() => setStep('start')} className="flex items-center gap-1 text-xs font-semibold text-white/60 hover:text-white"><ChevronLeft className="h-4 w-4" /> Back</button>
                <h2 className="text-2xl font-bold tracking-tight">Choose a ready-made avatar</h2>
                <p className="text-sm text-white/60">Six finished looks. Pick one, then adjust clothing, height and colour in the preview room. No photo is used.</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {READY_MADE_AVATARS.map((p) => {
                    const active = cfg.avatarName === p.config.avatarName && cfg.source === 'preset';
                    return (
                      <button key={p.id} onClick={() => setCfg({ ...p.config })} aria-pressed={active} className={`rounded-2xl border p-3 text-left transition ${active ? 'border-[#c8a96a] bg-[#c8a96a]/10' : 'border-white/10 bg-white/[0.03] hover:border-white/30'}`}>
                        <div className="mb-3 flex -space-x-1.5">
                          {[p.config.skinTone, p.config.hairColor, p.config.outfitColor, p.config.pantsColor].map((c, i) => (
                            <span key={i} className="h-6 w-6 rounded-full border-2 border-[#1b1916]" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <div className="text-sm font-semibold">{p.label}</div>
                        <div className="text-[11px] capitalize text-white/50">{p.config.hairStyle} · {p.config.topStyle}</div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setStep('preview')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c8a96a] py-3 text-sm font-bold text-[#1a1712] hover:bg-[#d6b97c]">Continue to preview room <ArrowRight className="h-4 w-4" /></button>
              </div>
            )}

            {step === 'preview' && (
              <div className="space-y-5">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8a96a]">Preview room</div>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Ready to step inside?</h2>
                  <p className="mt-2 text-sm text-white/60">Turn the figure, check the front and side, then change clothes, height or colour before you walk in.</p>
                </div>
                {estimateNote && <div className="flex gap-2 rounded-xl bg-[#c8a96a]/10 p-3 text-xs leading-relaxed text-[#ead6ab]"><Info className="h-4 w-4 shrink-0" />{estimateNote}</div>}
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  {[['Skin', cfg.skinTone], [cfg.hairStyle === 'headscarf' ? 'Headscarf' : 'Hair', cfg.hairColor], ['Top', cfg.outfitColor], ['Bottoms', cfg.pantsColor]].map(([l, c]) => (
                    <div key={l} className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-2.5"><span className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: c }} />{l}</div>
                  ))}
                </div>
                <div className="space-y-2 rounded-2xl border border-white/10 p-4 text-xs text-white/75">
                  <div className="font-semibold text-white/90">Save my avatar for next time (optional)</div>
                  <label className={`flex items-start gap-3 ${signedIn ? 'cursor-pointer' : 'opacity-50'}`}>
                    <input type="checkbox" disabled={!signedIn} checked={saveAccount && signedIn} onChange={(e) => setSaveAccount(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#c8a96a]" />
                    <span>Save to my account {signedIn ? '' : '(sign in to enable)'} — colours and clothing only, never the photo. You can delete it at any time.</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={saveDevice} onChange={(e) => setSaveDevice(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#c8a96a]" />
                    <span>{cfg.portrait ? 'Remember on this device, including your photo face' : 'Remember on this device'}</span>
                  </label>
                  {saveError && <div className="text-rose-300">{saveError}</div>}
                </div>
                <p className="text-[11px] leading-relaxed text-white/45">
                  {cfg.faceShape
                    ? 'The head is a 3D model of the face in your photo. Clothes, height and accessories still change for try-on.'
                    : 'Ready-made avatars use a styled figure. Start from a photo to build a 3D head from your face.'}
                </p>
              </div>
            )}

            {step === 'customize' && (
              <div className="space-y-5">
                <button onClick={() => setStep('preview')} className="flex items-center gap-1 text-xs font-semibold text-white/60 hover:text-white"><ChevronLeft className="h-4 w-4" /> Back to preview room</button>
                <h2 className="text-2xl font-bold tracking-tight">Edit my avatar</h2>
                {cfg.portrait && (
                  <div className="flex items-center gap-3 rounded-2xl border border-[#c8a96a]/35 bg-[#c8a96a]/10 p-3">
                    <img src={cfg.portrait} alt="" className="h-16 w-14 rounded-xl object-cover ring-1 ring-[#c8a96a]/50" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">3D head from your photo</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-white/65">Clothing, height and colours still apply. The body stays the fitting model.</div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button type="button" onClick={() => setStep('photo')} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/15">New photo</button>
                      <button type="button" onClick={() => setCfg((c) => { const n = { ...c }; delete n.portrait; delete n.faceShape; return n; })} className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-white/10">Remove</button>
                    </div>
                  </div>
                )}
                <div className="flex gap-1 rounded-full bg-white/[0.05] p-1" role="tablist">
                  {([['body', 'Body', User], ['face', 'Face & hair', Sun], ['clothing', 'Clothing', Shirt], ['accessories', 'Accessories', Glasses]] as const).map(([id, label, Icon]) => (
                    <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[11px] font-semibold transition sm:text-xs ${tab === id ? 'bg-[#c8a96a] text-[#1a1712]' : 'text-white/70 hover:text-white'}`}>
                      <Icon className="hidden h-3.5 w-3.5 sm:block" />{label}
                    </button>
                  ))}
                </div>
                {tab === 'body' && (
                  <div className="space-y-5">
                    <Field title="Body frame"><Chips label="Body frame" value={cfg.gender} onChange={(v) => update({ gender: v })} options={[{ id: 'female', label: 'Feminine' }, { id: 'male', label: 'Masculine' }, { id: 'neutral', label: 'Neutral' }]} /></Field>
                    <Field title="Build"><Chips label="Build" value={cfg.bodyType || 'average'} onChange={(v) => update({ bodyType: v })} options={[{ id: 'slim', label: 'Slim' }, { id: 'average', label: 'Average' }, { id: 'broad', label: 'Broad' }, { id: 'curvy', label: 'Curvy' }]} /></Field>
                    <Field title={`Height · approx. ${Math.round(172 * cfg.heightScale * (cfg.gender === 'female' ? 0.955 : 1))} cm`}>
                      <input type="range" min={0.9} max={1.12} step={0.01} value={cfg.heightScale} onChange={(e) => update({ heightScale: +e.target.value })} className="w-full accent-[#c8a96a]" aria-label="Height" />
                    </Field>
                    <Field title="Skin tone"><Swatches label="Skin tone" colors={SKIN} value={cfg.skinTone} onChange={(c) => update({ skinTone: c })} /></Field>
                  </div>
                )}
                {tab === 'face' && (
                  <div className="space-y-5">
                    <Field title="Hairstyle"><Chips label="Hairstyle" value={cfg.hairStyle} onChange={(v) => update({ hairStyle: v })} options={HAIRSTYLES} /></Field>
                    <Field title={cfg.hairStyle === 'headscarf' ? 'Headscarf colour' : 'Hair colour'}>
                      <Swatches label="Hair colour" colors={cfg.hairStyle === 'headscarf' ? SCARF : HAIR} value={cfg.hairColor} onChange={(c) => update({ hairColor: c })} />
                    </Field>
                    <Field title="Eye colour"><Swatches label="Eye colour" colors={EYES} value={cfg.eyeColor} onChange={(c) => update({ eyeColor: c })} /></Field>
                    <Field title="Facial hair"><Chips label="Facial hair" value={cfg.facialHair || 'none'} onChange={(v) => update({ facialHair: v })} options={[{ id: 'none', label: 'None' }, { id: 'stubble', label: 'Stubble' }, { id: 'moustache', label: 'Moustache' }, { id: 'beard', label: 'Beard' }]} /></Field>
                  </div>
                )}
                {tab === 'clothing' && (
                  <div className="space-y-5">
                    <Field title="Top"><Chips label="Top style" value={cfg.topStyle || 'tee'} onChange={(v) => update({ topStyle: v })} options={[{ id: 'tee', label: 'T-shirt' }, { id: 'shirt', label: 'Shirt' }, { id: 'knit', label: 'Knit' }, { id: 'jacket', label: 'Jacket' }]} /></Field>
                    <Swatches label="Top colour" colors={CLOTH} value={cfg.outfitColor} onChange={(c) => update({ outfitColor: c })} />
                    <Field title="Bottoms"><Chips label="Bottom style" value={cfg.bottomStyle || 'trousers'} onChange={(v) => update({ bottomStyle: v })} options={[{ id: 'trousers', label: 'Trousers' }, { id: 'jeans', label: 'Jeans' }, { id: 'skirt', label: 'Skirt' }, { id: 'shorts', label: 'Shorts' }]} /></Field>
                    <Swatches label="Bottoms colour" colors={CLOTH} value={cfg.pantsColor} onChange={(c) => update({ pantsColor: c })} />
                    <Field title="Shoes"><Chips label="Shoe style" value={cfg.shoeStyle || 'sneakers'} onChange={(v) => update({ shoeStyle: v })} options={[{ id: 'sneakers', label: 'Sneakers' }, { id: 'formal', label: 'Formal' }, { id: 'boots', label: 'Boots' }]} /></Field>
                    <Swatches label="Shoe colour" colors={['#f1f0ec', '#141414', '#3a2618', '#5a3a26', '#4a4f56', '#1f2a44', '#b9a27a']} value={cfg.shoesColor} onChange={(c) => update({ shoesColor: c })} />
                  </div>
                )}
                {tab === 'accessories' && (
                  <div className="space-y-5">
                    <Field title="Glasses">
                      <Chips label="Glasses" value={cfg.accessories.glasses ? cfg.glassesStyle || 'optical' : 'none'} onChange={(v) => (v === 'none' ? updateAcc({ glasses: false }) : (updateAcc({ glasses: true }), update({ glassesStyle: v as 'optical' | 'sun' })))} options={[{ id: 'none', label: 'None' }, { id: 'optical', label: 'Optical' }, { id: 'sun', label: 'Sunglasses' }]} />
                      {cfg.accessories.glasses && <Swatches label="Frame colour" colors={['#151515', '#6b3d1f', '#c8a96a', '#9aa0a6', '#1f2a44']} value={cfg.glassesColor} onChange={(c) => update({ glassesColor: c })} />}
                    </Field>
                    <Field title="Watch">
                      <Chips label="Watch" value={cfg.accessories.watch ? cfg.watchStrap || 'leather' : 'none'} onChange={(v) => (v === 'none' ? updateAcc({ watch: false }) : (updateAcc({ watch: true }), update({ watchStrap: v as 'leather' | 'metal' | 'silicone' })))} options={[{ id: 'none', label: 'None' }, { id: 'leather', label: 'Leather strap' }, { id: 'metal', label: 'Metal' }, { id: 'silicone', label: 'Sport' }]} />
                      {cfg.accessories.watch && <Swatches label="Case colour" colors={['#c9ccd0', '#c8a96a', '#c99b86', '#232427']} value={cfg.watchCaseColor} onChange={(c) => update({ watchCaseColor: c })} />}
                    </Field>
                    <Field title="Bag">
                      <Chips label="Bag" value={cfg.accessories.bag ? 'tote' : 'none'} onChange={(v) => updateAcc({ bag: v === 'tote' })} options={[{ id: 'none', label: 'None' }, { id: 'tote', label: 'Tote bag' }]} />
                      {cfg.accessories.bag && <Swatches label="Bag colour" colors={['#e6dcc6', '#1b1b1b', '#7a4a2a', '#1f2a44']} value={cfg.bagColor} onChange={(c) => update({ bagColor: c })} />}
                    </Field>
                    <Field title="Shopping basket">
                      <Chips label="Basket" value={cfg.accessories.shoppingBasket ? 'yes' : 'no'} onChange={(v) => updateAcc({ shoppingBasket: v === 'yes' })} options={[{ id: 'yes', label: 'Carry a basket' }, { id: 'no', label: 'Hands free' }]} />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>

          {(step === 'preview' || step === 'customize') && (
            <div className="flex flex-col gap-2 border-t border-white/10 bg-[#1b1916] p-4 sm:flex-row sm:px-8">
              <button onClick={() => confirm(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#c8a96a] py-3.5 text-sm font-extrabold tracking-[0.12em] text-[#1a1712] hover:bg-[#d6b97c]">ENTER STORE <ArrowRight className="h-4 w-4" /></button>
              {step === 'preview' ? (
                <button onClick={() => setStep('customize')} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 py-3.5 text-sm font-bold tracking-[0.12em] hover:bg-white/5">EDIT MY AVATAR</button>
              ) : (
                <button onClick={() => setStep('photo')} className="flex items-center justify-center gap-2 rounded-xl border border-white/20 px-5 py-3.5 text-xs font-semibold hover:bg-white/5"><ImageIcon className="h-4 w-4" /> Start again from a photo</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
