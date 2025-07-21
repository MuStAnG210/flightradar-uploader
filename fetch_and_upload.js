const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const unixTimestamp = Math.floor(Date.now() / 1000) - 86400;
const searchTypes = ['departures', 'arrivals'];
const urls = [];
for (const searchType of searchTypes) {
  for (let page = 1; page <= 4; page++) {
    urls.push(`https://api.flightradar24.com/common/v1/airport.json?code=gyd&plugin[]=&plugin-setting[schedule][mode]=${searchType}&plugin-setting[schedule][timestamp]=${unixTimestamp}&page=${page}&limit=100`);
  }
}

(async () => {
  let allFlights = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const searchType = url.includes('departures') ? 'departures' : 'arrivals';
      const flightsData = data.result?.response?.airport?.pluginData?.schedule?.[searchType]?.data;
      if (flightsData) {
        // Иногда flightsData - это объект, иногда массив
        let flightsArray;
        if (Array.isArray(flightsData)) {
          flightsArray = flightsData;
        } else {
          flightsArray = Object.values(flightsData);
        }
        console.log(`URL: ${url} | Найдено рейсов: ${flightsArray.length}`);
        allFlights = allFlights.concat(flightsArray);
      } else {
        console.log(`URL: ${url} | Нет рейсов`);
      }
    } catch (error) {
      console.error(`Ошибка загрузки с ${url}: `, error);
    }
  }

  // Для теста сохраняем ВСЁ, что пришло, без фильтрации
  console.log('Всего рейсов:', allFlights.length);

  const ref = db.collection('All_Flights').doc('data');
  await ref.set({ flights: allFlights, updated_at: Date.now() });
  console.log('Успешно загружено!');
})();
