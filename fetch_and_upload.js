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

const excludedAirlines = [
  'Silk Way West Airlines', 'ASG Business Aviation', 'Cargolux', 'Prince Aviation', 'Silk Way Airlines',
  'CMA CGM Air Cargo', 'Georgian Airlines', 'Atlas Air', 'Cargolux (Retro Livery)', 'Cargolux (Not Without My Mask Livery)', 'AirX', 'AMC Aviation', 'Smartwings', 'Jet Fly Airline', 'Alaman Air', 'Fly Pro', 'YTO Cargo Airlines', 'Turkish Cargo'
];

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
        let flightsArray;
        if (Array.isArray(flightsData)) {
          flightsArray = flightsData;
        } else {
          flightsArray = Object.values(flightsData);
        }
        allFlights = allFlights.concat(flightsArray);
      }
    } catch (error) {
      console.error(`Ошибка загрузки с ${url}: `, error);
    }
  }

  // Фильтрация по авиакомпании
  allFlights = allFlights.filter(flight => {
    const airlineName = flight.flight?.airline?.name;
    return airlineName && !excludedAirlines.includes(airlineName);
  });

  // Оставляем только нужные поля
  const minimalFlights = allFlights.map(flight => {
    const type = flight.flight?.status?.generic?.status?.type;
    return {
      id: flight.flight?.identification?.id || null,
      number: flight.flight?.identification?.number?.default || null,
      callsign: flight.flight?.identification?.callsign || null,
      registration: flight.flight?.aircraft?.registration || null,
      aircraft_code: flight.flight?.aircraft?.model?.code || null,
      airline: flight.flight?.airline?.name || null,
      type: type || null,
      status: flight.flight?.status?.live ? "live" : "not_live",
      city: type === "departure"
        ? flight.flight?.airport?.destination?.position?.region?.city || null
        : flight.flight?.airport?.origin?.position?.region?.city || null,
      iata: type === "departure"
        ? flight.flight?.airport?.destination?.code?.iata || null
        : flight.flight?.airport?.origin?.code?.iata || null,
      scheduledDeparture: flight.flight?.time?.scheduled?.departure || null,
      scheduledArrival: flight.flight?.time?.scheduled?.arrival || null,
      estimatedDeparture: flight.flight?.time?.estimated?.departure || null,
      estimatedArrival: flight.flight?.time?.estimated?.arrival || null,
      realDeparture: flight.flight?.time?.real?.departure || null,
      realArrival: flight.flight?.time?.real?.arrival || null,
    };
  });

  console.log('Сохраняется рейсов:', minimalFlights.length);

  const ref = db.collection('All_Flights').doc('data');
  await ref.set({ flights: minimalFlights, updated_at: Date.now() });
  console.log('Успешно загружено!');
})();
