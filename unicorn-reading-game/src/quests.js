// Quests = the "few variations of her goal".
//
// Each quest is a little mission: read GOAL_SIZE words to fill up a tray of
// themed tokens (stars, flowers, treats...). Finishing a quest triggers a big
// celebration AND unlocks a new magical friend for the collection. The quest
// then rotates to the next variation so every mission feels fresh.

export const GOAL_SIZE = 5; // words per quest

export const QUESTS = [
  { id: 'stars',    title: 'Catch the stars',  token: '⭐', cheer: 'You caught all the stars!' },
  { id: 'flowers',  title: 'Grow the garden',  token: '🌷', cheer: 'Your garden bloomed!' },
  { id: 'treats',   title: 'Unicorn picnic',   token: '🧁', cheer: 'Yummy! Picnic time!' },
  { id: 'gems',     title: 'Find the treasure',token: '💎', cheer: 'You found the treasure!' },
  { id: 'balloons', title: 'Fill the sky',     token: '🎈', cheer: 'Up, up and away!' },
  { id: 'hearts',   title: 'Spread the love',  token: '💖', cheer: 'So much love!' },
];

// Magical friends unlocked one-by-one as quests are completed. Collecting them
// gives a longer-term reward to keep coming back for. Order = unlock order.
export const FRIENDS = [
  '🦄', '🦋', '🐝', '🐞', '🐠', '🐢', '🐰', '🐱',
  '🐶', '🐥', '🦉', '🍄', '🐬', '🦩', '🦚', '🐧',
  '🐨', '🦊', '🐼', '🌟',
];
