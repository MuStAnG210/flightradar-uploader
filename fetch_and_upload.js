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

// Настрой фильтры!
const excludedAirlines = [
  'Silk Way West Airlines', 'ASG Business Aviation', 'Cargolux', 'Prince Aviation', 'Silk Way Airlines',
  'CMA CGM Air Cargo', 'Georgian Airlines', 'Atlas Air', 'Cargolux (Retro Livery)', 'Cargolux (Not Without My Mask Livery)', 'AirX', 'AMC Aviation', 'Smartwings', 'Jet Fly Airline', 'Alaman Air', 'Fly Pro', 'YTO Cargo Airlines', 'Turkish Cargo'
];

const SIX_HOURS = 6 * 3600;
const TWELVE_HOURS = 12 * 3600;

(async () => {
  let allFlights = [];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const searchType = url.includes('departures') ? 'departures' : 'arrivals';
      const flights = data.result?.response?.airport?.pluginData?.schedule?.[searchType]?.data;
      if (flights) {
        const arr = Object.values(flights);
        console.log(`URL: ${url} | Найдено рейсов: ${arr.length}`);
        allFlights = allFlights.concat(arr);
      } else {
        console.log(`URL: ${url} | Нет рейсов`);
      }
    } catch (error) {
      console.error(`Ошибка загрузки с ${url}: `, error);
    }
  }

  // Фильтрация
  allFlights = allFlights.filter(flight => {
    const airlineName = flight.flight?.airline?.name;
    return airlineName && !excludedAirlines.includes(airlineName);
  });

  const currentTime = Math.floor(Date.now() / 1000);
  const sixHoursAgo = currentTime - SIX_HOURS;
  const twelveHoursAgo = currentTime - TWELVE_HOURS;
  const timeRangeStart = currentTime - TWELVE_HOURS;
  const timeRangeEnd = currentTime + TWELVE_HOURS;

  allFlights = allFlights.filter(flight => {
    const type = flight.flight?.status?.generic?.status?.type;
    const estimatedArrival = flight.flight?.time?.estimated?.arrival;
    if (type === 'arrival' && estimatedArrival && estimatedArrival < sixHoursAgo) return false;
    const scheduledTime = type === 'departure'
      ? flight.flight?.time?.scheduled?.departure
      : flight.flight?.time?.scheduled?.arrival;
    return scheduledTime >= timeRangeStart && scheduledTime <= timeRangeEnd;
  });

  // Только нужные поля
  const minimalFlights = allFlights.map(flight => {
    const type = flight.flight?.status?.generic?.status?.type;
    return {
      id: flight.flight?.identification?.id || null,
      number: flight.flight?.identification?.number?.default || null,
      callsign: flight.flight?.identification?.callsign || null,
      registration: flight.flight?.aircraft?.registration || null,
      aircraft_code: flight.flight?.aircraft?.model?.code || null,
      airline: flight.flight?.airline?.name || null,
      type: type,
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

  // Сохраняем все рейсы в одном массиве
  const ref = db.collection('All_Flights').doc('data');
  await ref.set({ flights: minimalFlights, updated_at: Date.now() });
  console.log('Успешно загружено!');
})();
