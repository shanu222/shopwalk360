import { AvatarConfig, TryOnOverride, WearableSlot } from '../../../types';
import { parseWatchVariant, parseColorMap } from '../builder/productModels';

/** Apply try-on garments/accessories to an avatar configuration (non-destructive) */
export function applyTryOns(base: AvatarConfig, tryOns: TryOnOverride[], colorMaps: Record<string, string> = {}): AvatarConfig {
  const cfg: AvatarConfig = { ...base, accessories: { ...base.accessories } };
  tryOns.forEach((t) => {
    switch (t.slot) {
      case 'top':
        cfg.outfitColor = t.colorHex;
        cfg.topStyle = 'shirt';
        break;
      case 'bottom':
        cfg.pantsColor = t.colorHex;
        cfg.bottomStyle = 'trousers';
        break;
      case 'shoes':
        cfg.shoesColor = t.colorHex;
        cfg.shoeStyle = 'sneakers';
        break;
      case 'watch': {
        const w = parseWatchVariant(t.colorName, colorMaps);
        cfg.accessories.watch = true;
        cfg.watchCaseColor = w.caseHex;
        cfg.watchStrap = w.strap;
        cfg.watchStrapColor = w.strapHex;
        break;
      }
      case 'glasses':
        cfg.accessories.glasses = true;
        cfg.glassesStyle = 'sun';
        cfg.glassesColor = t.colorHex;
        break;
      case 'bag':
        cfg.accessories.bag = true;
        cfg.bagColor = t.colorHex;
        break;
      case 'lips':
        cfg.lipColor = t.colorHex;
        break;
    }
  });
  return cfg;
}

export function slotForProduct(p: { wearable_slot?: WearableSlot | null; tryon_type?: string }): WearableSlot | null {
  if (p.wearable_slot) return p.wearable_slot;
  if (p.tryon_type === 'beauty') return 'lips';
  return null;
}

export { parseColorMap };
