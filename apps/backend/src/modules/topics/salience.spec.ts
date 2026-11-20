import {
  addSalience,
  candidateScore,
  cosineSimilarity,
  currentSalience,
  decay,
  passesFloor,
} from './salience';

const neutral = { urgency: 0, sticky: false, recentDisconnects: 0 };

describe('topic salience', () => {
  it('halves after one half-life of active days', () => {
    expect(decay(2, 14, 14)).toBeCloseTo(1);
    expect(decay(2, 28, 14)).toBeCloseTo(0.5);
  });

  it('does not decay while no active day has passed', () => {
    expect(currentSalience({ salience: 3, salienceAtActiveDay: 10 }, 10)).toBe(
      3,
    );
  });

  it('adds an event to the decayed value and moves the reference day', () => {
    expect(addSalience({ salience: 2, salienceAtActiveDay: 0 }, 1, 14)).toEqual(
      { salience: 2, salienceAtActiveDay: 14 },
    );
  });

  it('never lets a disconnect push salience below zero', () => {
    expect(
      addSalience({ salience: 0.4, salienceAtActiveDay: 5 }, -1, 5).salience,
    ).toBe(0);
  });
});

describe('topic candidate ranking', () => {
  it('lets a clearly better match beat a much more frequent topic', () => {
    const rare = candidateScore({ ...neutral, similarity: 0.72, salience: 1 });
    const frequent = candidateScore({
      ...neutral,
      similarity: 0.55,
      salience: 40,
    });

    expect(rare).toBeGreaterThan(frequent);
  });

  it('uses frequency to break a near tie', () => {
    const rare = candidateScore({ ...neutral, similarity: 0.6, salience: 1 });
    const frequent = candidateScore({
      ...neutral,
      similarity: 0.6,
      salience: 12,
    });

    expect(frequent).toBeGreaterThan(rare);
  });

  it('ranks the topic recognized earlier in the episode higher', () => {
    expect(
      candidateScore({
        ...neutral,
        similarity: 0.5,
        salience: 1,
        sticky: true,
      }),
    ).toBeGreaterThan(
      candidateScore({ ...neutral, similarity: 0.5, salience: 1 }),
    );
  });
});

describe('topic candidate floor', () => {
  it('never offers an unconfirmed candidate topic', () => {
    expect(passesFloor('candidate', 0.99, true)).toBe(false);
  });

  it('admits an anchored active topic below the similarity floor', () => {
    expect(passesFloor('active', 0.1, true)).toBe(true);
    expect(passesFloor('active', 0.1, false)).toBe(false);
  });

  it('asks more of dormant topics and needs a strong match for dismissed ones', () => {
    expect(passesFloor('dormant', 0.45, false)).toBe(false);
    expect(passesFloor('dormant', 0.55, false)).toBe(true);
    expect(passesFloor('dismissed', 0.6, true)).toBe(false);
    expect(passesFloor('dismissed', 0.75, false)).toBe(true);
  });
});

describe('cosine similarity', () => {
  it('is 1 for the same direction and 0 for mismatched vectors', () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
  });
});
