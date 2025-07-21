// fetch_and_upload.js
const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Вставьте ваш serviceAccount ключ из Firebase (скачивается из консоли Firebase)
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const unixTimestamp = Math.floor(Date.now() / 1000) - 86400;
const urls = [];
const searchTypes = ['departures', 'arrivals'];
for (const searchType of searchTypes) {
  for (let page = 1; page  {
  let flightsFound = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const searchType = url.includes('departures') ? 'departures' : 'arrivals';
      const flights = data.result?.response?.airport?.pluginData?.schedule?.[searchType]?.data;
      if (flights) {
        flightsFound = flightsFound.concat(Object.values(flights));
      }
    } catch (error) {
      console.error(`Could not fetch data from ${url}: `, error);
    }
  }

  // Сохраняем в коллекцию "All_Flights"
  const ref = db.collection('All_Flights').doc('data');
  await ref.set({ flights: flightsFound, updated_at: Date.now() });
  console.log('Данные успешно загружены!');
})();
