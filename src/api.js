import * as config from './config.js';
import firebase from '@firebase/app';
import '@firebase/firestore';

const firebaseStateCollection = 'state';

export const getFirebaseApiUrl = (toTrack) => {
  const id = config.getUniqueId();
  return `https://duaelmix.com/api/v1?session=${id}&on=${toTrack}`;
};

export const listenToFirebase = (currentSubIndexReceiverFunc) => {
  const db = firebase.firestore();
  const docRef = db
    .collection(firebaseStateCollection)
    .doc(config.getUniqueId());
  docRef.onSnapshot(function(doc) {
    const track = doc.data() ? doc.data().t : 0;
    currentSubIndexReceiverFunc(track);
  });
};