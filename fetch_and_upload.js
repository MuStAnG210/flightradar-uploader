const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const unixTimestamp = Math.floor(Date.now() / 1000) - 86400;
const urls = [];
const searchTypes = ['departures', 'arrivals'];
for (const searchType of searchTypes) {
  for (let page = 1; page <= 4; page++) {
    urls.push(`https://api.flightradar24.com/common/v1/airport.json?code=gyd&plugin[]=&plugin-setting[schedule][mode]=${searchType}&plugin-setting[schedule][timestamp]=${unixTimestamp}&page=${page}&limit=100`);
  }
}

// --- НАСТРОЙ ФИЛЬТРЫ ТАК ЖЕ КАК В FRONT ---
const excludedAirlines = [
  'Silk Way West Airlines', 'ASG Business Aviation', 'Cargolux', 'Prince Aviation', 'Silk Way Airlines',
  'CMA CGM Air Cargo', 'Georgian Airlines', 'Atlas Air', 'Cargolux (Retro Livery)', 'Cargolux (Not Without My Mask Livery)', 'AirX', 'AMC Aviation', 'Smartwings', 'Jet Fly Airline', 'Alaman Air', 'Fly Pro', 'YTO Cargo Airlines', 'Turkish Cargo'
];

const SIX_HOURS = 6 * 3600;
const TWELVE_HOURS = 12 * 3600;

(async () => {
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

  // ФИЛЬТРАЦИЯ ПО АВИАКОМПАНИИ
  flightsFound = flightsFound.filter(flight => {
    const airlineName = flight.flight?.airline?.name;
    return airlineName && !excludedAirlines.includes(airlineName);
  });

  // ФИЛЬТРАЦИЯ ПО ВРЕМЕНИ (аналогично фронту)
  const currentTime = Math.floor(Date.now() / 1000);
  const sixHoursAgo = currentTime - SIX_HOURS;
  const twelveHoursAgo = currentTime - TWELVE_HOURS;
  const timeRangeStart = currentTime - TWELVE_HOURS;
  const timeRangeEnd = currentTime + TWELVE_HOURS;

  flightsFound = flightsFound.filter(flight => {
    const type = flight.flight?.status?.generic?.status?.type;
    const estimatedArrival = flight.flight?.time?.estimated?.arrival;
    // arrivals больше 6 часов назад не нужны
    if (type === 'arrival' && estimatedArrival && estimatedArrival < sixHoursAgo) return false;

    // Оставляем только рейсы с временем в диапазоне +/- 12 часов
    const scheduledTime = type === 'departure'
      ? flight.flight?.time?.scheduled?.departure
      : flight.flight?.time?.scheduled?.arrival;
    return scheduledTime >= timeRangeStart && scheduledTime <= timeRangeEnd;
  });

  // СОБИРАЕМ ТОЛЬКО НУЖНЫЕ ПОЛЯ
  const minimalFlights = flightsFound.map(flight => {
    const type = flight.flight?.status?.generic?.status?.type;
    const scheduledDeparture = flight.flight?.time?.scheduled?.departure || null;
    const scheduledArrival = flight.flight?.time?.scheduled?.arrival || null;
    const estimatedDeparture = flight.flight?.time?.estimated?.departure || null;
    const estimatedArrival = flight.flight?.time?.estimated?.arrival || null;
    const realDeparture = flight.flight?.time?.real?.departure || null;
    const realArrival = flight.flight?.time?.real?.arrival || null;

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

      scheduledDeparture,
      scheduledArrival,
      estimatedDeparture,
      estimatedArrival,
      realDeparture,
      realArrival,
    };
  });

  // СОХРАНЯЕМ ТОЛЬКО МИНИМАЛЬНЫЕ ДАННЫЕ
  const ref = db.collection('All_Flights').doc('data');
  await ref.set({ flights: minimalFlights, updated_at: Date.now() });
  console.log('Только необходимые данные успешно загружены!');
})();
