/** The Sakura District's live-infected cap (kept apart from the model code so the server simulation can use it). */
import { ANIME_CAST } from '../config';
import { isTouchDevice } from '../player/touch';

/** Live infected on this map at once: the models cost far more to draw than the stock ones. Phones get fewer. */
export function animeHordeCap(): number {
  return isTouchDevice() ? ANIME_CAST.hardCapTouch : ANIME_CAST.hardCap;
}
