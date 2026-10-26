import constructionCranes480 from './images/construction-cranes-480.webp';
import constructionCranes960 from './images/construction-cranes-960.webp';
import gardensResidences480 from './images/gardens-residences-480.webp';
import gardensResidences960 from './images/gardens-residences-960.webp';
import heightsDusk480 from './images/heights-dusk-480.webp';
import heightsDusk960 from './images/heights-dusk-960.webp';
import interiorKitchen480 from './images/interior-kitchen-480.webp';
import interiorKitchen960 from './images/interior-kitchen-960.webp';
import interiorLivingBright480 from './images/interior-living-bright-480.webp';
import interiorLivingBright960 from './images/interior-living-bright-960.webp';
import interiorLivingCity480 from './images/interior-living-city-480.webp';
import interiorLivingCity960 from './images/interior-living-city-960.webp';
import viewDuskWindow480 from './images/view-dusk-window-480.webp';
import viewDuskWindow960 from './images/view-dusk-window-960.webp';

/**
 * Typed image registry (docs/design/ASSET_REGISTRY.md is the human-readable twin).
 *
 * Every photograph is CC0 1.0 stock of real buildings and rooms that are NOT the fictional
 * Larkspur projects, so the UI must always show the "Illustrative image" label next to it
 * (owner rule: fictional projects are never presented as real completed developments).
 * Alt text is translated: `altKey` lives in the `common` namespace.
 */
export type ImageKey =
  | 'heights-dusk'
  | 'gardens-residences'
  | 'interior-living-city'
  | 'interior-living-bright'
  | 'interior-kitchen'
  | 'view-dusk-window'
  | 'construction-cranes';

export type ImageSource = 'StockSnap' | 'rawpixel' | 'WordPress Photo Directory';

export interface ImageAsset {
  key: ImageKey;
  /** Width descriptor → URL, for srcset. */
  srcset: Record<480 | 960, string>;
  /** Intrinsic size of the largest rendition (reserves layout space, no shift). */
  width: number;
  height: number;
  /** `common:` translation key for the alt text. */
  altKey: `images.${string}`;
  /** CSS object-position that keeps the subject in frame when cropped. */
  focus: string;
  illustrative: true;
  credit: { title: string; creator: string | null; source: ImageSource; license: 'CC0 1.0'; url: string };
}

const asset = (a: Omit<ImageAsset, 'illustrative'>): ImageAsset => ({ ...a, illustrative: true });

export const IMAGES: Readonly<Record<ImageKey, ImageAsset>> = {
  'heights-dusk': asset({
    key: 'heights-dusk',
    srcset: { 480: heightsDusk480, 960: heightsDusk960 },
    width: 960,
    height: 720,
    altKey: 'images.heightsDusk',
    focus: '60% 40%',
    credit: { title: 'Modern Building', creator: 'The Building Envelope', source: 'StockSnap', license: 'CC0 1.0', url: 'https://stocksnap.io/photo/modern-building-CAVRPFBKZ3' },
  }),
  'gardens-residences': asset({
    key: 'gardens-residences',
    srcset: { 480: gardensResidences480, 960: gardensResidences960 },
    width: 960,
    height: 540,
    altKey: 'images.gardensResidences',
    focus: '50% 55%',
    credit: { title: 'A modern, multi-story white apartment building with palm trees', creator: 'Faisal Ahammad', source: 'WordPress Photo Directory', license: 'CC0 1.0', url: 'https://wordpress.org/photos/photo/1606979817/' },
  }),
  'interior-living-city': asset({
    key: 'interior-living-city',
    srcset: { 480: interiorLivingCity480, 960: interiorLivingCity960 },
    width: 960,
    height: 638,
    altKey: 'images.interiorLivingCity',
    focus: '50% 60%',
    credit: { title: 'White simple living room interior', creator: 'Scott Webb', source: 'rawpixel', license: 'CC0 1.0', url: 'https://www.rawpixel.com/image/430394/free-photo-image-living-room-interior-house' },
  }),
  'interior-living-bright': asset({
    key: 'interior-living-bright',
    srcset: { 480: interiorLivingBright480, 960: interiorLivingBright960 },
    width: 960,
    height: 682,
    altKey: 'images.interiorLivingBright',
    focus: '50% 55%',
    credit: { title: 'Modern living room interior', creator: null, source: 'rawpixel', license: 'CC0 1.0', url: 'https://www.rawpixel.com/image/5915137/image-light-public-domain-plants' },
  }),
  'interior-kitchen': asset({
    key: 'interior-kitchen',
    srcset: { 480: interiorKitchen480, 960: interiorKitchen960 },
    width: 960,
    height: 640,
    altKey: 'images.interiorKitchen',
    focus: '45% 55%',
    credit: { title: 'Modern white kitchen interior', creator: null, source: 'rawpixel', license: 'CC0 1.0', url: 'https://www.rawpixel.com/image/6042749/photo-image-public-domain-minimal-house' },
  }),
  'view-dusk-window': asset({
    key: 'view-dusk-window',
    srcset: { 480: viewDuskWindow480, 960: viewDuskWindow960 },
    width: 960,
    height: 640,
    altKey: 'images.viewDuskWindow',
    focus: '50% 45%',
    credit: { title: 'Window View', creator: 'World Travel Adventures', source: 'StockSnap', license: 'CC0 1.0', url: 'https://stocksnap.io/photo/window-view-OY7XWKUNZG' },
  }),
  'construction-cranes': asset({
    key: 'construction-cranes',
    srcset: { 480: constructionCranes480, 960: constructionCranes960 },
    width: 960,
    height: 640,
    altKey: 'images.constructionCranes',
    focus: '50% 40%',
    credit: { title: 'Building Construction', creator: '贝莉儿 NG', source: 'StockSnap', license: 'CC0 1.0', url: 'https://stocksnap.io/photo/building-construction-QDDPZH3YSO' },
  }),
};

export const srcSet = (image: ImageAsset) => `${image.srcset[480]} 480w, ${image.srcset[960]} 960w`;
