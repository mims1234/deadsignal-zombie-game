/**
 * The Sakura District's voice director (`sakura/voice.ts`): one line at a time, the mission's calls first, the story
 * never dropped and in the order it happened, directions only while they still apply, a place's word only while it is
 * news, a bark only if it can be said at once - so doing two things at once never loses what the story needs.
 */
import { describe, expect, it } from 'vitest';
import { LINE, LINES } from '../src/sakura/lines';
import { SakuraVoice } from '../src/sakura/voice';

/** A director with no sound (captions only, each as long as it would take to say), and what it said, in order. */
function director(): { v: SakuraVoice; said: string[]; run: (from: number, to: number) => void } {
  const v = new SakuraVoice({ play: () => {} } as never);
  const said: string[] = [];
  v.onCaption = (_who, text) => said.push(LINES.find((l) => l.text === text)?.id ?? text);
  const run = (from: number, to: number): void => {
    for (let t = from; t <= to; t += 0.1) v.update(+t.toFixed(1));
  };
  return { v, said, run };
}

describe('the Sakura voice director', () => {
  it('says one line at a time, never two over each other, and loses no story line', () => {
    const { v, said, run } = director();
    // two things at once: a charm taken as the squad walks into a new place, and Command calls
    v.say('aoi_charm_0', { kind: 'story' });
    v.say('place_school', { kind: 'place' });
    v.say('aoi_charm_1', { kind: 'story' });
    v.say('cmd_relay_done', { kind: 'system' });
    v.say('kind_rooted', { kind: 'bark' });
    run(0, 60);
    // Command first; then the story in the order it happened; the place's word while it was still news; the bark could
    // not be said at once, so it was not
    expect(said[0]).toBe('cmd_relay_done');
    expect(said.indexOf('aoi_charm_0')).toBeLessThan(said.indexOf('aoi_charm_1'));
    expect(said).toContain('aoi_charm_1');
    expect(said).not.toContain('kind_rooted');
    expect(new Set(said).size).toBe(said.length);
  });

  it('drops a direction that no longer applies when its turn comes, and never the story', () => {
    const { v, said, run } = director();
    let found = false;
    v.say('aoi_charm_2', { kind: 'story' });
    v.say('aoi_dir_canal', { kind: 'direction', valid: () => !found });
    found = true; // the player found it before Aoi could say where
    run(0, 40);
    expect(said).toEqual(['aoi_charm_2']);
  });

  it('a place\'s word expires once it is old news, and the dead do not talk', () => {
    const { v, said, run } = director();
    v.canSpeak = (who) => who !== 'HANA';
    v.say('aoi_bloom', { kind: 'story' });
    v.say('aoi_procession', { kind: 'story' });
    v.say('place_canal', { kind: 'place' }); // Hana's, and she is down
    v.say('place_shotengai', { kind: 'place' }); // still news after the two long ones? (20 s)
    run(0, 60);
    expect(said.slice(0, 2)).toEqual(['aoi_bloom', 'aoi_procession']);
    expect(said).not.toContain('place_canal');
  });

  it('says a line once a run when asked, and every line has its words and a voice', () => {
    const { v, said, run } = director();
    v.say('pa_arriving', { kind: 'story', once: true });
    run(0, 10);
    v.say('pa_arriving', { kind: 'story', once: true });
    run(10, 20);
    expect(said.filter((s) => s === 'pa_arriving').length).toBe(1);
    for (const l of LINES) {
      expect(l.text.length, l.id).toBeGreaterThan(3);
      expect(l.voice, l.id).toBeTruthy();
      expect(LINE[l.id]).toBe(l);
    }
  });
});
