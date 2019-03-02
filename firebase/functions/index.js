const functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp();

const firestore = admin.firestore();
const settings = {timestampsInSnapshots: true};
firestore.settings(settings);

exports.apiV1 = functions.https.onRequest((request, response) => {
  const session = request.query.session;
  if (!/^[a-z0-9]{10}$/.exec(session)) {
    return response.status(400).end();
  }
  const on = Number.parseInt(request.query.on);
  if (isNaN(on) || on < 0 || on > 1) {
    return response.status(400).end();
  }
  const doc = firestore.collection('state').doc(session);
  const action = doc.set({
    _: Math.floor(Date.now() / 1000),
    t: on,
  }).catch((err) => {
    throw err;
  });
  return response.status(204).end();
});
