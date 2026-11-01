import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PresenceClient, RemoteShopper } from '../../lib/presence';
import { MonitorX, Store, RefreshCw } from 'lucide-react';
import { AvatarConfig, CartItem, ExperienceIntegrations, Product, StoreLayoutV2, StoreShelf, TryOnOverride } from '../../types';
import { StoreEngine, Quality, CameraMode, detectWebGL, suggestQuality } from './engine/StoreEngine';
import { InteractiveTarget } from './builder/storeBuilder';
import { Zone } from './layout/storeLayout';
import { EntranceGate } from './EntranceGate';
import { StoreHUD } from './StoreHUD';
import { AvatarStudio } from './avatar/AvatarStudio';
import { ProductExperiencePanel } from './product/ProductExperiencePanel';
import { DEFAULT_AVATAR } from './avatar/AvatarModel';
import { applyTryOns } from './avatar/tryOn';
import { loadSavedAvatar, deleteSavedAvatar } from './avatar/avatarService';
import { parseColorMap } from './builder/productModels';
import { storeAudio } from './engine/audio';

interface Props {
  cart: CartItem[];
  focusCategorySlug: string | null;
  onFocusHandled: () => void;
  externalModalOpen: boolean;
  onAddToCart: (p: Product, qty: number, variant?: string) => void;
  onBuyNow: (p: Product, qty: number, variant?: string) => void;
  onOpenCart: () => void;
  onOpenCheckout: () => void;
  onSwitchTo2D: () => void;
}

type Phase = 'gate' | 'entering' | 'shopping';

const QUALITY_KEY = 'shopwalk360_quality';

export default function ShopWalkExperience(props: Props) {
  const { cart, focusCategorySlug, onFocusHandled, externalModalOpen, onAddToCart, onBuyNow, onOpenCart, onOpenCheckout, onSwitchTo2D } = props;
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<StoreEngine | null>(null);
  const [webgl] = useState(() => detectWebGL());
  const [layout, setLayout] = useState<StoreLayoutV2 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState({ p: 0, label: '' });
  const [phase, setPhase] = useState<Phase>('gate');
  const [contextLost, setContextLost] = useState(false);
  const [integrations, setIntegrations] = useState<ExperienceIntegrations>({ avatarGeneration: false, garmentTryOn: false, aiAssistant: false });

  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [saved, setSaved] = useState<{ config: AvatarConfig; where: 'account' | 'device' } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [studio, setStudio] = useState<{ open: boolean; step: 'start' | 'presets' | 'preview' | 'customize'; enterOnConfirm: boolean }>({ open: false, step: 'start', enterOnConfirm: true });
  const [tryOns, setTryOns] = useState<TryOnOverride[]>([]);

  const [cameraMode, setCameraMode] = useState<CameraMode>('third_person');
  const [quality, setQualityState] = useState<Quality>(() => {
    try {
      return (localStorage.getItem(QUALITY_KEY) as Quality) || suggestQuality();
    } catch {
      return suggestQuality();
    }
  });
  const [nearest, setNearest] = useState<InteractiveTarget | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [player, setPlayer] = useState<{ x: number; z: number; yaw: number } | null>(null);
  // other real shoppers (live presence)
  const presence = useRef<PresenceClient | null>(null);
  const [others, setOthers] = useState<RemoteShopper[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [showOthers, setShowOthers] = useState(() => {
    try {
      return localStorage.getItem('shopwalk360_show_others') !== 'off';
    } catch {
      return true;
    }
  });
  const [route, setRoute] = useState<{ x: number; z: number }[] | null>(null);
  const [walking, setWalking] = useState(false);
  const [inspect, setInspect] = useState<StoreShelf | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [isTouch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  const pendingFocus = useRef<string | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3200);
  }, []);

  const colorMaps = useMemo(() => {
    const m: Record<string, string> = {};
    layout?.shelves.forEach((s) => Object.assign(m, parseColorMap(s.color_hex_map)));
    return m;
  }, [layout]);
  const effectiveAvatar = useMemo(() => applyTryOns(avatar, tryOns, colorMaps), [avatar, tryOns, colorMaps]);

  /* -------------------------------------------------- boot */
  useEffect(() => {
    if (!webgl.ok) return;
    let cancelled = false;
    Promise.all([
      fetch('/api/store3d/v2/layout').then((r) => (r.ok ? r.json() : Promise.reject(new Error('Layout unavailable')))),
      fetch('/api/experience/integrations').then((r) => r.json()).catch(() => null),
      loadSavedAvatar(),
    ])
      .then(([lay, integ, sv]) => {
        if (cancelled) return;
        setLayout(lay);
        if (integ) setIntegrations(integ);
        setSaved(sv.saved);
        setSignedIn(sv.signedIn);
        if (sv.saved) setAvatar(sv.saved.config);
        const eng = new StoreEngine(mount.current!, quality, {
          onProgress: (p, label) => setProgress({ p, label }),
          onReady: () => setReady(true),
          onNearest: setNearest,
          onPosition: (p) => {
            setPlayer(p);
            const st = eng.getPlayerState();
            presence.current?.sendPosition(st.x, st.z, st.yaw, st.speed, st.inside);
            setWalking(eng.isWalking());
          },
          onZone: setZone,
          onInteract: (t) => handleInteract.current(t),
          onEntered: () => {
            setPhase('shopping');
            if (pendingFocus.current) {
              focusDepartment.current(pendingFocus.current);
              pendingFocus.current = null;
            }
          },
          onArrive: () => setWalking(false),
          onRouteChange: (r) => setRoute(r),
          onContextLost: () => setContextLost(true),
          onQualityDrop: (q) => {
            setQualityState(q);
            showToast(`Graphics set to ${q} so the store runs smoothly on this device.`);
          },
          onAvatarError: showToast,
        });
        engine.current = eng;
        (window as any).__shopwalk = eng; // handy for support / automated checks
        eng.load(lay, sv.saved?.config || DEFAULT_AVATAR, false).catch((e) => setLoadError(String(e?.message || e)));
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------------------------- sync state into the engine */
  useEffect(() => {
    engine.current?.setAvatarConfig(effectiveAvatar);
    presence.current?.setLook(effectiveAvatar);
  }, [effectiveAvatar, ready]);

  // live presence: connect once the store is ready, disconnect when leaving the 3D store
  useEffect(() => {
    if (!ready) return;
    const client = new PresenceClient((list) => {
      setOthers(list);
      engine.current?.setRemoteShoppers(list);
    });
    presence.current = client;
    client.onStatus = setLiveConnected;
    client.setLook(effectiveAvatar);
    // leaving the page (closing the tab or navigating away) removes the shopper straight away
    const onUnload = () => client.close();
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      client.close();
      presence.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    engine.current?.setShowOthers(showOthers);
    try {
      localStorage.setItem('shopwalk360_show_others', showOthers ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [showOthers, ready]);
  const cartCount = cart.reduce((a, i) => a + i.quantity, 0);
  const cartSubtotal = cart.reduce((a, i) => a + (i.product.discount_price || i.product.regular_price) * i.quantity, 0);
  useEffect(() => {
    engine.current?.setBasketCount(cartCount);
  }, [cartCount, ready]);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const blocking = !!inspect || studio.open || externalModalOpen;
    e.inputEnabled = !blocking;
    e.setPaused(!!inspect || studio.open);
  }, [inspect, studio.open, externalModalOpen]);
  useEffect(() => {
    engine.current?.setCameraMode(cameraMode);
  }, [cameraMode, ready]);
  useEffect(() => {
    engine.current?.setQuality(quality);
    try {
      localStorage.setItem(QUALITY_KEY, quality);
    } catch {
      /* ignore */
    }
  }, [quality]);
  useEffect(() => {
    storeAudio.muted = muted;
  }, [muted]);

  // keyboard shortcut: V toggles camera
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (inspect || studio.open || externalModalOpen) return;
      if (e.code === 'KeyV') setCameraMode((m) => (m === 'third_person' ? 'first_person' : 'third_person'));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [inspect, studio.open, externalModalOpen]);

  /* -------------------------------------------------- interactions */
  const findShelfForProduct = (productId?: string) => layout?.shelves.find((s) => s.product_id === productId && s.zone !== 'demo') || layout?.shelves.find((s) => s.product_id === productId);

  const handleInteract = useRef<(t: InteractiveTarget) => void>(() => {});
  handleInteract.current = (t: InteractiveTarget) => {
    switch (t.kind) {
      case 'product':
        if (t.shelf) {
          setInspect(t.shelf);
          setHighlight(t.shelf.id);
        }
        break;
      case 'checkout':
        if (cart.length) onOpenCheckout();
        else {
          onOpenCart();
          showToast('Your basket is empty — pick something up first.');
        }
        break;
      case 'basket':
        if (!avatar.accessories.shoppingBasket) setAvatar((a) => ({ ...a, accessories: { ...a.accessories, shoppingBasket: true } }));
        showToast('You picked up a basket. Items you add will appear in it.');
        break;
      case 'map':
      case 'reception':
        setPanelRequest({ panel: 'map', n: Date.now() });
        break;
      case 'dept_info':
        setPanelRequest({ panel: 'directory', n: Date.now() });
        break;
      case 'promo': {
        const s = findShelfForProduct(t.promo?.product_id);
        if (s) setInspect(s);
        break;
      }
    }
  };
  const [panelRequest, setPanelRequest] = useState<{ panel: 'map' | 'directory'; n: number } | null>(null);

  const focusDepartment = useRef<(slug: string) => void>(() => {});
  focusDepartment.current = (slug: string) => {
    const d = layout?.departments.find((x) => x.category_slug === slug || x.id === slug);
    if (d && d.slot_index !== undefined && d.slot_index !== null) {
      engine.current?.goToDepartment(d.slot_index, true);
      setWalking(true);
      showToast(`Walking you to ${d.name}`);
    }
  };
  useEffect(() => {
    if (!focusCategorySlug || !ready) return;
    if (phase === 'shopping') focusDepartment.current(focusCategorySlug);
    else pendingFocus.current = focusCategorySlug;
    onFocusHandled();
  }, [focusCategorySlug, ready, phase, onFocusHandled]);

  const enterWith = (cfg: AvatarConfig) => {
    setAvatar(cfg);
    setPhase('entering');
    // let the avatar update before the walk-in starts
    requestAnimationFrame(() => engine.current?.enterStore());
  };

  const handleAdd = (p: Product, qty: number, variant?: string) => {
    onAddToCart(p, qty, variant);
    // close the panel so the shopper sees their avatar take the item into the basket
    const shelfId = inspect?.id;
    setInspect(null);
    engine.current?.playPick({ shelfId, productId: p.id, imageUrl: p.primary_image });
    showToast(`Added to your basket: ${p.name.replace(/\s*\(Sample Listing\)/, '')}`);
  };

  const wear = (o: TryOnOverride) => {
    setTryOns((list) => [...list.filter((x) => x.slot !== o.slot), o]);
    showToast(`Your avatar is now wearing ${o.productName.replace(/\s*\(Sample Listing\)/, '')}${o.colorName ? ` in ${o.colorName}` : ''}.`);
  };

  /* -------------------------------------------------- render */
  if (!webgl.ok) {
    return (
      <div className="flex h-full min-h-[480px] items-center justify-center bg-[#151311] p-6 text-white">
        <div className="max-w-md space-y-4 text-center">
          <MonitorX className="mx-auto h-10 w-10 text-[#c8a96a]" />
          <h2 className="text-xl font-bold">3D isn’t available on this device</h2>
          <p className="text-sm text-white/70">Your device can’t open the 3D store. Everything is available in the 2D store.</p>
          <button onClick={onSwitchTo2D} className="inline-flex items-center gap-2 rounded-xl bg-[#c8a96a] px-5 py-3 text-sm font-bold text-[#1a1712]"><Store className="h-4 w-4" /> Shop the online store</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#151311]">
      <div ref={mount} className="absolute inset-0" />

      {phase === 'gate' && !studio.open && (
        <EntranceGate
          ready={ready}
          progress={progress.p}
          progressLabel={progress.label}
          saved={saved}
          onCreate={() => setStudio({ open: true, step: 'start', enterOnConfirm: true })}
          onGuest={() => setStudio({ open: true, step: 'presets', enterOnConfirm: true })}
          onContinueSaved={() => saved && enterWith(saved.config)}
          onEditSaved={() => setStudio({ open: true, step: 'customize', enterOnConfirm: true })}
          onDeleteSaved={async () => {
            await deleteSavedAvatar();
            setSaved(null);
            setAvatar(DEFAULT_AVATAR);
            showToast('Your saved avatar has been deleted.');
          }}
          onClassic={onSwitchTo2D}
        />
      )}

      {phase === 'entering' && (
        <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/55 py-2 pl-4 pr-2 text-xs text-white backdrop-blur">
          Welcome to ShopWalk 360
          <button onClick={() => engine.current?.skipEntrance()} className="rounded-full bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25">Skip</button>
        </div>
      )}

      {phase === 'shopping' && layout && (
        <StoreHUDWithRequest
          request={panelRequest}
          departments={layout.departments}
          shelves={layout.shelves}
          cartCount={cartCount}
          cartSubtotal={cartSubtotal}
          cameraMode={cameraMode}
          quality={quality}
          zone={zone}
          nearest={nearest}
          player={player}
          others={showOthers ? others : []}
          othersCount={others.length}
          liveConnected={liveConnected}
          showOthers={showOthers}
          onToggleOthers={() => setShowOthers((v) => !v)}
          route={route}
          highlightShelfId={highlight}
          tryOns={tryOns}
          muted={muted}
          isTouch={isTouch}
          walking={walking}
          onToggleCamera={() => setCameraMode((m) => (m === 'third_person' ? 'first_person' : 'third_person'))}
          onOpenAvatar={() => setStudio({ open: true, step: 'preview', enterOnConfirm: false })}
          onLobby={() => {
            engine.current?.returnToLobby(true);
            setWalking(true);
          }}
          onExplore={(t) => handleInteract.current(t)}
          onExploreShelf={(s) => {
            setHighlight(s.id);
            setInspect(s);
          }}
          onGuide={(s, mode) => {
            setHighlight(s.id);
            const e = engine.current;
            if (!e) return;
            if (mode === 'walk') {
              e.goToTarget(s.id, { interact: false, walk: true });
              setWalking(true);
            } else if (mode === 'route') {
              e.goToTarget(s.id, { walk: false });
              showToast('Follow the gold arrows on the floor.');
            } else {
              e.jumpToTarget(s.id);
            }
          }}
          onDept={(slot, mode) => {
            engine.current?.goToDepartment(slot, mode === 'walk');
            if (mode === 'walk') setWalking(true);
          }}
          onMapPoint={(x, z) => {
            if (engine.current?.walkTo(x, z, { guide: true })) setWalking(true);
          }}
          onOpenCart={onOpenCart}
          onCheckout={onOpenCheckout}
          onQuality={setQualityState}
          onMute={() => setMuted((m) => !m)}
          onSwitch2D={onSwitchTo2D}
          onJoystick={(x, y) => engine.current?.setJoystick(x, y)}
          onRemoveTryOn={(slot) => setTryOns((l) => l.filter((t) => t.slot !== slot))}
          onAddTryOnToBasket={(t) => {
            const s = findShelfForProduct(t.productId);
            if (s) setInspect(s);
          }}
          onSkipWalk={() => engine.current?.skipToDestination()}
          onStopWalk={() => {
            engine.current?.cancelPath(true);
            setWalking(false);
          }}
          onClearRoute={() => engine.current?.clearRoute()}
        />
      )}

      {toast && (
        <div role="status" className="pointer-events-none absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded-full bg-[#1a1816]/92 px-4 py-2 text-xs font-medium text-white shadow-xl backdrop-blur">{toast}</div>
      )}

      {(loadError || contextLost) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6 text-white">
          <div className="max-w-sm space-y-4 text-center">
            <h2 className="text-lg font-bold">{contextLost ? 'The 3D view was paused by your device' : 'The virtual store could not load'}</h2>
            <p className="text-sm text-white/70">{contextLost ? 'This can happen when the device runs low on graphics memory.' : loadError}</p>
            <div className="flex justify-center gap-2">
              <button onClick={() => location.reload()} className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Reload</button>
              <button onClick={onSwitchTo2D} className="flex items-center gap-2 rounded-xl bg-[#c8a96a] px-4 py-2.5 text-sm font-bold text-[#1a1712]"><Store className="h-4 w-4" /> Online store</button>
            </div>
          </div>
        </div>
      )}

      <AvatarStudio
        open={studio.open}
        initialConfig={avatar}
        initialStep={studio.step}
        signedIn={signedIn}
        providerAvailable={integrations.avatarGeneration}
        onClose={() => setStudio((s) => ({ ...s, open: false }))}
        onConfirm={(cfg, enter) => {
          setStudio((s) => ({ ...s, open: false }));
          loadSavedAvatar().then((r) => setSaved(r.saved));
          if (phase === 'gate' && (enter || studio.enterOnConfirm)) enterWith(cfg);
          else setAvatar(cfg);
        }}
      />

      {inspect && (
        <ProductExperiencePanel
          shelf={inspect}
          avatar={avatar}
          integrations={integrations}
          tryOns={tryOns}
          onClose={() => setInspect(null)}
          onAdd={handleAdd}
          onBuyNow={(p, q, v) => {
            setInspect(null);
            onBuyNow(p, q, v);
          }}
          onWearInStore={(o) => {
            wear(o);
            setInspect(null);
          }}
        />
      )}
    </div>
  );
}

/** Lets the experience open a HUD panel (e.g. the map when the shopper uses the map kiosk) */
function StoreHUDWithRequest(props: React.ComponentProps<typeof StoreHUD> & { request: { panel: 'map' | 'directory'; n: number } | null }) {
  const { request, ...rest } = props;
  return <StoreHUD key={request?.n ?? 0} initialPanel={request?.panel ?? null} {...rest} />;
}
