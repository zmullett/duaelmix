const keyUniqueId = 'uniqueId';
const keyPlaylist = 'playlist';

const getAsJson = (name) => {
  return JSON.parse(localStorage.getItem(name));
};

const setAsJson = (name, object) => {
  localStorage.setItem(name, JSON.stringify(object));
};

export const getPlaylist = () => {
  const playlist = getAsJson(keyPlaylist);
  return Array.isArray(playlist) ? playlist : [];
};

export const setPlaylist = (playlist) => {
  setAsJson(keyPlaylist, playlist);
};

const buildRandomId = () => {
  const base = 36;
  const num = 10;
  return Array(num)
    .fill(base)
    .map(x => x * Math.random())
    .map(Math.floor)
    .map(x => x.toString(base))
    .join('');
};

export const getUniqueId = () => {
  let id = localStorage.getItem(keyUniqueId);
  if (!id) {
    id = buildRandomId();
    localStorage.setItem(keyUniqueId, id);
  }
  return id;
};